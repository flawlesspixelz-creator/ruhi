const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// Real persistence for phase 2: SQLite instead of json-server's db.json.
// approvers/approvalSteps stay as JSON columns since they're small, ordered
// lists always read/written together with their document; everything else
// that benefits from querying on its own (comments, attachments, history)
// gets a normal table.
const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL,
    customer TEXT NOT NULL,
    created_date TEXT NOT NULL,
    due_date TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    description TEXT,
    approvers TEXT NOT NULL DEFAULT '[]',
    approval_steps TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approval_history (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    comment TEXT,
    timestamp TEXT NOT NULL
  );
`;

function open(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count === 0) {
    seed(db);
  }
  return db;
}

// approvers/approvalSteps carried over from the phase-1 db.json fixture, in
// the order the candidate's approve/reject history already implies.
const seedUsers = [
  { id: "u1", name: "Alice Johnson", role: "creator" },
  { id: "u2", name: "Bob Martinez", role: "approver" },
  { id: "u3", name: "Chen Wei", role: "approver" },
  { id: "u4", name: "Dana Patel", role: "read-only" },
];

const seedDocuments = [
  {
    id: "d1", title: "MSA Renewal - Northwind Traders", documentType: "Contract", customer: "Northwind Traders",
    createdDate: "2026-06-01T09:00:00.000Z", dueDate: "2026-07-20T00:00:00.000Z", ownerId: "u1",
    status: "draft", priority: "High", description: "Annual master service agreement renewal with updated SLA terms.",
    approvers: ["u2", "u3"], approvalSteps: [],
    attachments: [{ id: "a1", name: "msa-draft-v3.pdf", contentType: "application/pdf", size: 245000, url: "http://localhost:4000/sample-files/msa-draft-v3.pdf" }],
    comments: [],
    history: [{ id: "h1", action: "created", actor: "Alice Johnson", comment: null, timestamp: "2026-06-01T09:00:00.000Z" }],
  },
  {
    id: "d2", title: "Q3 Invoice - Fabrikam Inc", documentType: "Invoice", customer: "Fabrikam Inc",
    createdDate: "2026-06-10T14:30:00.000Z", dueDate: "2026-06-25T00:00:00.000Z", ownerId: "u1",
    status: "pending_approval", priority: "Medium", description: "Quarterly invoice for consulting services rendered in Q2.",
    approvers: ["u2"], approvalSteps: [{ userId: "u2", status: "pending", decidedAt: null, comment: null }],
    attachments: [],
    comments: [{ id: "c1", author: "Bob Martinez", text: "Can you confirm the hours breakdown?", createdAt: "2026-06-11T10:00:00.000Z" }],
    history: [
      { id: "h1", action: "created", actor: "Alice Johnson", comment: null, timestamp: "2026-06-10T14:30:00.000Z" },
      { id: "h2", action: "submitted", actor: "Alice Johnson", comment: null, timestamp: "2026-06-10T15:00:00.000Z" },
    ],
  },
  {
    id: "d3", title: "Proposal - Contoso Cloud Migration", documentType: "Proposal", customer: "Contoso Ltd",
    createdDate: "2026-05-20T11:00:00.000Z", dueDate: "2026-07-01T00:00:00.000Z", ownerId: "u4",
    status: "approved", priority: "High", description: "Proposal covering phased migration to cloud infrastructure.",
    approvers: ["u2", "u3"],
    approvalSteps: [
      { userId: "u2", status: "approved", decidedAt: "2026-05-22T09:30:00.000Z", comment: null },
      { userId: "u3", status: "approved", decidedAt: "2026-05-22T10:00:00.000Z", comment: null },
    ],
    attachments: [{ id: "a1", name: "migration-proposal.pdf", contentType: "application/pdf", size: 512000, url: "http://localhost:4000/sample-files/migration-proposal.pdf" }],
    comments: [{ id: "c1", author: "Chen Wei", text: "Looks good, timeline is realistic.", createdAt: "2026-05-22T09:00:00.000Z" }],
    history: [
      { id: "h1", action: "created", actor: "Dana Patel", comment: null, timestamp: "2026-05-20T11:00:00.000Z" },
      { id: "h2", action: "submitted", actor: "Dana Patel", comment: null, timestamp: "2026-05-20T12:00:00.000Z" },
      { id: "h3", action: "approved", actor: "Bob Martinez", comment: null, timestamp: "2026-05-22T09:30:00.000Z" },
      { id: "h4", action: "approved", actor: "Chen Wei", comment: null, timestamp: "2026-05-22T10:00:00.000Z" },
    ],
  },
  {
    id: "d4", title: "Vendor Report - Litware Supplies", documentType: "Report", customer: "Litware Supplies",
    createdDate: "2026-06-15T08:00:00.000Z", dueDate: null, ownerId: "u1",
    status: "rejected", priority: "Low", description: "Monthly vendor performance report.",
    approvers: ["u3"],
    approvalSteps: [{ userId: "u3", status: "rejected", decidedAt: "2026-06-16T13:00:00.000Z", comment: "Figures for May don't match the finance export." }],
    attachments: [{ id: "a1", name: "vendor-report-may.pdf", contentType: "application/pdf", size: 120000, url: "http://localhost:4000/sample-files/vendor-report-may.pdf" }],
    comments: [{ id: "c1", author: "Chen Wei", text: "Figures for May don't match the finance export.", createdAt: "2026-06-16T13:00:00.000Z" }],
    history: [
      { id: "h1", action: "created", actor: "Alice Johnson", comment: null, timestamp: "2026-06-15T08:00:00.000Z" },
      { id: "h2", action: "submitted", actor: "Alice Johnson", comment: null, timestamp: "2026-06-15T08:30:00.000Z" },
      { id: "h3", action: "rejected", actor: "Chen Wei", comment: "Figures for May don't match the finance export.", timestamp: "2026-06-16T13:00:00.000Z" },
    ],
  },
  {
    id: "d5", title: "Policy Update - Data Retention", documentType: "Policy", customer: "Internal",
    createdDate: "2026-04-02T10:00:00.000Z", dueDate: "2026-04-30T00:00:00.000Z", ownerId: "u4",
    status: "approved", priority: "Medium", description: null,
    approvers: ["u2"], approvalSteps: [{ userId: "u2", status: "approved", decidedAt: "2026-04-10T09:00:00.000Z", comment: null }],
    attachments: [], comments: [],
    history: [
      { id: "h1", action: "created", actor: "Dana Patel", comment: null, timestamp: "2026-04-02T10:00:00.000Z" },
      { id: "h2", action: "approved", actor: "Bob Martinez", comment: null, timestamp: "2026-04-10T09:00:00.000Z" },
    ],
  },
  {
    id: "d6", title: "Renewal Proposal - Wingtip Toys", documentType: "Proposal", customer: "Wingtip Toys",
    createdDate: "2026-07-01T09:15:00.000Z", dueDate: "2026-07-15T00:00:00.000Z", ownerId: "u1",
    status: "draft", priority: "Medium", description: "Renewal terms for the annual retail partnership.",
    approvers: ["u2"], approvalSteps: [],
    attachments: [{ id: "a1", name: "scanned-signature-page.png", contentType: "image/png", size: 82000, url: "http://localhost:4000/sample-files/scanned-signature-page.png" }],
    comments: [],
    history: [{ id: "h1", action: "created", actor: "Alice Johnson", comment: null, timestamp: "2026-07-01T09:15:00.000Z" }],
  },
  {
    id: "d7", title: "Invoice #4471 - Adventure Works", documentType: "Invoice", customer: "Adventure Works",
    createdDate: "2026-06-28T16:00:00.000Z", dueDate: "2026-07-12T00:00:00.000Z", ownerId: "u4",
    status: "pending_approval", priority: "High", description: "Overdue equipment invoice awaiting sign-off.",
    approvers: ["u2", "u3"],
    approvalSteps: [
      { userId: "u2", status: "pending", decidedAt: null, comment: null },
      { userId: "u3", status: "pending", decidedAt: null, comment: null },
    ],
    attachments: [{ id: "a1", name: "invoice-4471.pdf", contentType: "application/pdf", size: 65000, url: "http://localhost:4000/sample-files/invoice-4471.pdf" }],
    comments: [],
    history: [
      { id: "h1", action: "created", actor: "Dana Patel", comment: null, timestamp: "2026-06-28T16:00:00.000Z" },
      { id: "h2", action: "submitted", actor: "Dana Patel", comment: null, timestamp: "2026-06-28T16:10:00.000Z" },
    ],
  },
];

function seed(db) {
  const insertUser = db.prepare("INSERT INTO users (id, name, role) VALUES (?, ?, ?)");
  const insertDocument = db.prepare(`
    INSERT INTO documents (id, title, document_type, customer, created_date, due_date, owner_id, status, priority, description, approvers, approval_steps)
    VALUES (@id, @title, @documentType, @customer, @createdDate, @dueDate, @ownerId, @status, @priority, @description, @approvers, @approvalSteps)
  `);
  const insertComment = db.prepare("INSERT INTO comments (id, document_id, author, text, created_at) VALUES (?, ?, ?, ?, ?)");
  const insertAttachment = db.prepare("INSERT INTO attachments (id, document_id, name, content_type, size, url) VALUES (?, ?, ?, ?, ?, ?)");
  const insertHistory = db.prepare("INSERT INTO approval_history (id, document_id, action, actor, comment, timestamp) VALUES (?, ?, ?, ?, ?, ?)");

  db.transaction(() => {
    for (const user of seedUsers) insertUser.run(user.id, user.name, user.role);
    for (const doc of seedDocuments) {
      insertDocument.run({
        ...doc,
        description: doc.description ?? null,
        approvers: JSON.stringify(doc.approvers),
        approvalSteps: JSON.stringify(doc.approvalSteps),
      });
      for (const c of doc.comments) insertComment.run(`${doc.id}-${c.id}`, doc.id, c.author, c.text, c.createdAt);
      for (const a of doc.attachments) insertAttachment.run(`${doc.id}-${a.id}`, doc.id, a.name, a.contentType, a.size, a.url);
      for (const h of doc.history) insertHistory.run(`${doc.id}-${h.id}`, doc.id, h.action, h.actor, h.comment ?? null, h.timestamp);
    }
  })();
}

module.exports = { open };
