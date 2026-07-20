const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const db = require("./db").open(process.env.DB_PATH || path.join(__dirname, "data.sqlite3"));

const app = express();
const parseJson = express.json();
const uploadDirectory = path.join(__dirname, "uploads");
const maxPdfSize = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: maxPdfSize },
});

fs.mkdirSync(uploadDirectory, { recursive: true });

app.use(cors());
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Simulate real-world network latency so loading states are actually visible.
// Set MOCK_API_DETERMINISTIC=1 to skip this and the random failures below,
// for scripted tests.
const deterministic = process.env.MOCK_API_DETERMINISTIC === "1";
app.use((req, res, next) => {
  if (deterministic) return next();
  setTimeout(next, 400);
});

function findUser(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function userRef(id) {
  const user = findUser(id);
  return user ? { id: user.id, name: user.name } : { id, name: id };
}

function serializeDocument(row) {
  if (!row) return null;
  const approverIds = JSON.parse(row.approvers);
  const approvalSteps = JSON.parse(row.approval_steps);
  return {
    id: row.id,
    title: row.title,
    documentType: row.document_type,
    customer: row.customer,
    createdDate: row.created_date,
    dueDate: row.due_date,
    owner: userRef(row.owner_id),
    status: row.status,
    priority: row.priority,
    description: row.description ?? undefined,
    approvers: approverIds.map(userRef),
    approvalSteps: approvalSteps.map((step) => ({
      approver: userRef(step.userId),
      status: step.status,
      decidedAt: step.decidedAt,
      comment: step.comment,
    })),
    comments: db.prepare("SELECT id, author, text, created_at AS createdAt FROM comments WHERE document_id = ? ORDER BY created_at").all(row.id),
    attachments: db
      .prepare("SELECT id, name, content_type AS contentType, size, url FROM attachments WHERE document_id = ?")
      .all(row.id),
    approvalHistory: db
      .prepare("SELECT id, action, actor, comment, timestamp FROM approval_history WHERE document_id = ? ORDER BY timestamp")
      .all(row.id),
  };
}

function findDocumentRow(id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
}

function pushHistory(documentId, action, actor, comment = null) {
  db.prepare("INSERT INTO approval_history (id, document_id, action, actor, comment, timestamp) VALUES (?, ?, ?, ?, ?, ?)").run(
    `h-${crypto.randomUUID()}`,
    documentId,
    action,
    actor,
    comment,
    new Date().toISOString(),
  );
}

function requireStatus(row, expected, res) {
  if (row.status !== expected) {
    res.status(409).json({
      error: `Document is "${row.status}", expected "${expected}" for this action.`,
    });
    return false;
  }
  return true;
}

function requireActor(req, res) {
  const actor = req.body && req.body.actor;
  if (!actor) {
    res.status(400).json({ error: "actor is required" });
    return null;
  }
  return actor;
}

// Roughly 1 in 12 write requests fails, so the frontend has to handle real API errors.
function maybeSimulateFailure(res) {
  if (!deterministic && Math.random() < 1 / 12) {
    res.status(500).json({ error: "Simulated server error. Please try again." });
    return true;
  }
  return false;
}

// Serve small, valid PDFs so candidates can implement and demonstrate a
// viewer without needing file storage infrastructure for this exercise.
function createSamplePdf(title) {
  const safeTitle = title.replace(/[()\\]/g, "");
  const stream = [
    "BT",
    "/F1 20 Tf",
    "72 720 Td",
    `(${safeTitle}) Tj`,
    "0 -36 Td",
    "/F1 12 Tf",
    "(Sample PDF attachment for the Document Approval Portal.) Tj",
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf);
}

app.get("/sample-files/:filename.pdf", (req, res) => {
  const title = req.params.filename.replace(/[-_]/g, " ");
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${req.params.filename}.pdf"`,
    "Cache-Control": "public, max-age=3600",
  });
  res.send(createSamplePdf(title));
});

function cleanDisplayName(originalName) {
  const filename = originalName.replace(/\\/g, "/").split("/").pop();
  const cleaned = Array.from(filename)
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join("")
    .trim();
  return cleaned.slice(0, 180) || "document.pdf";
}

app.post("/uploads", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A PDF is required in the "file" field.' });
  }

  const isPdfMimeType = req.file.mimetype.toLowerCase() === "application/pdf";
  const hasPdfSignature = req.file.buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!isPdfMimeType || !hasPdfSignature) {
    return res.status(415).json({ error: "Only valid PDF files are supported." });
  }

  const id = crypto.randomUUID();
  const storedName = `${id}.pdf`;
  fs.writeFileSync(path.join(uploadDirectory, storedName), req.file.buffer, { flag: "wx" });

  res.status(201).json({
    id,
    name: cleanDisplayName(req.file.originalname),
    contentType: "application/pdf",
    size: req.file.size,
    url: `${req.protocol}://${req.get("host")}/uploads/${storedName}`,
  });
});

app.get("/uploads/:filename", (req, res) => {
  if (!/^[0-9a-f-]{36}\.pdf$/i.test(req.params.filename)) {
    return res.status(404).json({ error: "PDF not found" });
  }

  const filePath = path.join(uploadDirectory, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "PDF not found" });
  }

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${req.params.filename}"`,
    "X-Content-Type-Options": "nosniff",
  });
  res.sendFile(filePath);
});

function hasInvalidAttachments(attachments) {
  return (
    !Array.isArray(attachments) ||
    attachments.some(
      (attachment) =>
        !attachment ||
        attachment.contentType !== "application/pdf" ||
        typeof attachment.url !== "string",
    )
  );
}

app.get("/users", (req, res) => {
  res.json(db.prepare("SELECT * FROM users").all());
});

app.get("/documents", (req, res) => {
  const rows = db.prepare("SELECT * FROM documents ORDER BY created_date").all();
  res.json(rows.map(serializeDocument));
});

app.get("/documents/:id", (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  res.json(serializeDocument(row));
});

app.post("/documents", parseJson, (req, res) => {
  const attachments = req.body.attachments ?? [];
  if (hasInvalidAttachments(attachments)) {
    return res.status(400).json({ error: "All attachments must be uploaded PDFs." });
  }
  const actor = requireActor(req, res);
  if (!actor) return;
  const owner = findUser(actor);
  if (!owner) {
    return res.status(400).json({ error: "actor must be a known user id." });
  }
  if (maybeSimulateFailure(res)) return;

  const { owner: _clientOwner, actor: _actor, approvers, attachments: _attachments, ...fields } = req.body;
  const id = crypto.randomUUID();
  const approverIds = Array.isArray(approvers) ? approvers.map((a) => (typeof a === "string" ? a : a.id)) : [];

  db.prepare(
    `INSERT INTO documents (id, title, document_type, customer, created_date, due_date, owner_id, status, priority, description, approvers, approval_steps)
     VALUES (@id, @title, @documentType, @customer, @createdDate, @dueDate, @ownerId, 'draft', @priority, @description, @approvers, '[]')`,
  ).run({
    id,
    title: fields.title,
    documentType: fields.documentType,
    customer: fields.customer,
    createdDate: new Date().toISOString(),
    dueDate: fields.dueDate ?? null,
    ownerId: owner.id,
    priority: fields.priority,
    description: fields.description ?? null,
    approvers: JSON.stringify(approverIds),
  });

  for (const attachment of attachments) {
    db.prepare("INSERT INTO attachments (id, document_id, name, content_type, size, url) VALUES (?, ?, ?, ?, ?, ?)").run(
      attachment.id || crypto.randomUUID(),
      id,
      attachment.name,
      attachment.contentType,
      attachment.size,
      attachment.url,
    );
  }

  pushHistory(id, "created", owner.name);
  res.status(201).json(serializeDocument(findDocumentRow(id)));
});

app.put("/documents/:id", parseJson, (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  if (req.body.attachments && hasInvalidAttachments(req.body.attachments)) {
    return res.status(400).json({ error: "All attachments must be uploaded PDFs." });
  }
  if (maybeSimulateFailure(res)) return;

  const { id, status, comments, approvalHistory, createdDate, owner, approvers, attachments, ...editableFields } = req.body;

  const updates = { ...editableFields };
  if (approvers) {
    updates.approvers = JSON.stringify(approvers.map((a) => (typeof a === "string" ? a : a.id)));
  }
  const columns = {
    title: "title",
    documentType: "document_type",
    customer: "customer",
    dueDate: "due_date",
    priority: "priority",
    description: "description",
    approvers: "approvers",
  };
  const setClauses = Object.keys(updates)
    .filter((key) => columns[key])
    .map((key) => `${columns[key]} = @${key}`);
  if (setClauses.length > 0) {
    db.prepare(`UPDATE documents SET ${setClauses.join(", ")} WHERE id = @id`).run({ ...updates, id: row.id });
  }

  if (attachments) {
    db.prepare("DELETE FROM attachments WHERE document_id = ?").run(row.id);
    for (const attachment of attachments) {
      db.prepare("INSERT INTO attachments (id, document_id, name, content_type, size, url) VALUES (?, ?, ?, ?, ?, ?)").run(
        attachment.id || crypto.randomUUID(),
        row.id,
        attachment.name,
        attachment.contentType,
        attachment.size,
        attachment.url,
      );
    }
  }

  res.json(serializeDocument(findDocumentRow(row.id)));
});

app.post("/documents/:id/submit", parseJson, (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(row, "draft", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  const approverIds = JSON.parse(row.approvers);
  if (approverIds.length === 0) {
    return res.status(400).json({ error: "At least one approver is required to submit." });
  }
  if (maybeSimulateFailure(res)) return;

  const approvalSteps = approverIds.map((userId) => ({ userId, status: "pending", decidedAt: null, comment: null }));
  db.prepare("UPDATE documents SET status = 'pending_approval', approval_steps = ? WHERE id = ?").run(
    JSON.stringify(approvalSteps),
    row.id,
  );
  pushHistory(row.id, "submitted", userRef(actor).name);
  res.json(serializeDocument(findDocumentRow(row.id)));
});

// Approvers act in the order they appear on the document: only the first
// approver whose step is still "pending" may approve or reject.
function currentStep(approvalSteps) {
  return approvalSteps.find((step) => step.status === "pending") || null;
}

app.post("/documents/:id/approve", parseJson, (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(row, "pending_approval", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;

  const approvalSteps = JSON.parse(row.approval_steps);
  const step = currentStep(approvalSteps);
  if (!step || step.userId !== actor) {
    return res.status(409).json({ error: "It is not this approver's turn to approve." });
  }
  if (maybeSimulateFailure(res)) return;

  step.status = "approved";
  step.decidedAt = new Date().toISOString();
  step.comment = req.body.comment || null;
  const isLastStep = approvalSteps.every((s) => s.status === "approved");

  db.prepare("UPDATE documents SET approval_steps = ?, status = ? WHERE id = ?").run(
    JSON.stringify(approvalSteps),
    isLastStep ? "approved" : "pending_approval",
    row.id,
  );
  pushHistory(row.id, "approved", userRef(actor).name, step.comment);
  res.json(serializeDocument(findDocumentRow(row.id)));
});

app.post("/documents/:id/reject", parseJson, (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(row, "pending_approval", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  const reason = req.body.reason;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "A rejection reason is required." });
  }

  const approvalSteps = JSON.parse(row.approval_steps);
  const step = currentStep(approvalSteps);
  if (!step || step.userId !== actor) {
    return res.status(409).json({ error: "It is not this approver's turn to reject." });
  }
  if (maybeSimulateFailure(res)) return;

  step.status = "rejected";
  step.decidedAt = new Date().toISOString();
  step.comment = reason;

  db.prepare("UPDATE documents SET approval_steps = ?, status = 'rejected' WHERE id = ?").run(
    JSON.stringify(approvalSteps),
    row.id,
  );
  pushHistory(row.id, "rejected", userRef(actor).name, reason);
  res.json(serializeDocument(findDocumentRow(row.id)));
});

app.post("/documents/:id/return-to-draft", parseJson, (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(row, "rejected", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;

  db.prepare("UPDATE documents SET status = 'draft' WHERE id = ?").run(row.id);
  pushHistory(row.id, "returned_to_draft", userRef(actor).name);
  res.json(serializeDocument(findDocumentRow(row.id)));
});

app.post("/documents/:id/comments", parseJson, (req, res) => {
  const row = findDocumentRow(req.params.id);
  if (!row) return res.status(404).json({ error: "Document not found" });
  const { author, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Comment text is required." });
  }
  if (maybeSimulateFailure(res)) return;

  const comment = {
    id: `c-${crypto.randomUUID()}`,
    author: author || "Unknown",
    text,
    createdAt: new Date().toISOString(),
  };
  db.prepare("INSERT INTO comments (id, document_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)").run(
    comment.id,
    row.id,
    comment.author,
    comment.text,
    comment.createdAt,
  );
  res.status(201).json(comment);
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "PDF must be 10 MB or smaller." });
    }
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mock API ready at http://localhost:${PORT}`);
});
