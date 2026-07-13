const express = require("express");
const jsonServer = require("json-server");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const router = jsonServer.router("db.json");
const middlewares = jsonServer.defaults();
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
app.use(middlewares);

// Simulate real-world network latency so loading states are actually visible.
app.use((req, res, next) => {
  setTimeout(next, 400);
});

function getDb() {
  return router.db;
}

function findDocument(id) {
  return getDb().get("documents").find({ id }).value();
}

function pushHistory(doc, action, actor, comment = null) {
  doc.approvalHistory = doc.approvalHistory || [];
  doc.approvalHistory.push({
    id: `h${doc.approvalHistory.length + 1}-${Date.now()}`,
    action,
    actor,
    comment,
    timestamp: new Date().toISOString(),
  });
}

function requireStatus(doc, expected, res) {
  if (doc.status !== expected) {
    res.status(409).json({
      error: `Document is "${doc.status}", expected "${expected}" for this action.`,
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
  if (Math.random() < 1 / 12) {
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
  const cleaned = filename.replace(/[\u0000-\u001f\u007f]/g, "").trim();
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

app.post("/documents", parseJson, (req, res) => {
  const attachments = req.body.attachments ?? [];
  if (hasInvalidAttachments(attachments)) {
    return res.status(400).json({ error: "All attachments must be uploaded PDFs." });
  }
  if (maybeSimulateFailure(res)) return;

  const document = {
    ...req.body,
    id: crypto.randomUUID(),
    status: "draft",
    comments: [],
    attachments,
    approvalHistory: [],
  };
  getDb().get("documents").push(document).write();
  res.status(201).json(document);
});

app.put("/documents/:id", parseJson, (req, res) => {
  const document = findDocument(req.params.id);
  if (!document) return res.status(404).json({ error: "Document not found" });
  if (req.body.attachments && hasInvalidAttachments(req.body.attachments)) {
    return res.status(400).json({ error: "All attachments must be uploaded PDFs." });
  }
  if (maybeSimulateFailure(res)) return;

  const { id, status, comments, approvalHistory, ...editableFields } = req.body;
  Object.assign(document, editableFields);
  getDb().write();
  res.json(document);
});

app.post("/documents/:id/submit", parseJson, (req, res) => {
  const doc = findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(doc, "draft", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  if (maybeSimulateFailure(res)) return;

  doc.status = "pending_approval";
  pushHistory(doc, "submitted", actor);
  getDb().write();
  res.json(doc);
});

app.post("/documents/:id/approve", parseJson, (req, res) => {
  const doc = findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(doc, "pending_approval", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  if (maybeSimulateFailure(res)) return;

  doc.status = "approved";
  pushHistory(doc, "approved", actor, req.body.comment || null);
  getDb().write();
  res.json(doc);
});

app.post("/documents/:id/reject", parseJson, (req, res) => {
  const doc = findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(doc, "pending_approval", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;
  const reason = req.body.reason;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: "A rejection reason is required." });
  }
  if (maybeSimulateFailure(res)) return;

  doc.status = "rejected";
  pushHistory(doc, "rejected", actor, reason);
  getDb().write();
  res.json(doc);
});

app.post("/documents/:id/return-to-draft", parseJson, (req, res) => {
  const doc = findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!requireStatus(doc, "rejected", res)) return;
  const actor = requireActor(req, res);
  if (!actor) return;

  doc.status = "draft";
  pushHistory(doc, "returned_to_draft", actor);
  getDb().write();
  res.json(doc);
});

app.post("/documents/:id/comments", parseJson, (req, res) => {
  const doc = findDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  const { author, text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Comment text is required." });
  }
  if (maybeSimulateFailure(res)) return;

  doc.comments = doc.comments || [];
  const comment = {
    id: `c${doc.comments.length + 1}-${Date.now()}`,
    author: author || "Unknown",
    text,
    createdAt: new Date().toISOString(),
  };
  doc.comments.push(comment);
  getDb().write();
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

// Falls through to json-server's default REST router for:
// GET/POST /documents, GET/PUT/PATCH/DELETE /documents/:id, GET /users
app.use(router);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mock API ready at http://localhost:${PORT}`);
});
