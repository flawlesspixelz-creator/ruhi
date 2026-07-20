const assert = require("assert/strict");
const { spawn } = require("child_process");
const { once } = require("events");
const fs = require("fs");
const path = require("path");

const port = 4123;
const baseUrl = `http://127.0.0.1:${port}`;
const apiDirectory = __dirname;
const databasePath = path.join(apiDirectory, "smoke-test.sqlite3");
fs.rmSync(databasePath, { force: true });
const uploadedFilePaths = [];

const server = spawn(process.execPath, ["server.js"], {
  cwd: apiDirectory,
  env: { ...process.env, PORT: String(port), DB_PATH: databasePath, MOCK_API_DETERMINISTIC: "1" },
  stdio: ["ignore", "pipe", "inherit"],
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Mock API did not start")), 5000);
    server.once("exit", (code) => reject(new Error(`Mock API exited with code ${code}`)));
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Mock API ready")) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function requestJson(pathname, options = {}, expectedStatus = 200, retry500 = false) {
  let response;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    response = await fetch(`${baseUrl}${pathname}`, options);
    if (!retry500 || response.status !== 500) break;
  }

  const body = await response.json();
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method || "GET"} ${pathname}: ${JSON.stringify(body)}`,
  );
  return body;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function draft(title, attachments = []) {
  return {
    title,
    documentType: "Contract",
    customer: "Internal",
    createdDate: new Date().toISOString(),
    dueDate: null,
    actor: "u1",
    owner: { id: "u1", name: "Alice Johnson" },
    status: "approved",
    priority: "Low",
    description: "Temporary contract-smoke record",
    approvers: [{ id: "u2", name: "Bob Martinez" }],
    comments: [{ id: "not-accepted", author: "Test", text: "Ignored" }],
    attachments,
    approvalHistory: [{ id: "not-accepted", action: "approved" }],
  };
}

async function run() {
  await waitForServer();

  const homeResponse = await fetch(baseUrl);
  assert.equal(homeResponse.status, 200);
  const homePage = await homeResponse.text();
  assert.match(homePage, /Document Approval Portal mock API/);
  assert.doesNotMatch(homePage, />undefined</);

  const initialDocuments = await requestJson("/documents");
  assert.equal(Array.isArray(initialDocuments), true);
  assert.equal(initialDocuments.length > 0, true);

  const users = await requestJson("/users");
  assert.equal(Array.isArray(users), true);
  assert.equal(users.some((user) => user.role === "approver"), true);

  await requestJson("/documents/does-not-exist", {}, 404);

  const missingFileForm = new FormData();
  await requestJson("/uploads", { method: "POST", body: missingFileForm }, 400);

  const invalidFileForm = new FormData();
  invalidFileForm.append("file", new Blob(["not a PDF"], { type: "text/plain" }), "bad.txt");
  await requestJson("/uploads", { method: "POST", body: invalidFileForm }, 415);

  const pdfForm = new FormData();
  pdfForm.append(
    "file",
    new Blob(["%PDF-1.4\n% contract smoke test\n%%EOF\n"], { type: "application/pdf" }),
    "cross-platform-smoke.pdf",
  );
  const attachment = await requestJson("/uploads", { method: "POST", body: pdfForm }, 201);
  assert.equal(attachment.contentType, "application/pdf");
  assert.equal(attachment.name, "cross-platform-smoke.pdf");
  uploadedFilePaths.push(path.join(apiDirectory, "uploads", `${attachment.id}.pdf`));

  const pdfResponse = await fetch(attachment.url);
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get("content-type"), /^application\/pdf/);
  assert.equal((await pdfResponse.text()).startsWith("%PDF-"), true);

  const created = await requestJson(
    "/documents",
    jsonOptions("POST", draft("Contract smoke: approve", [attachment])),
    201,
    true,
  );
  assert.equal(created.status, "draft");
  assert.deepEqual(created.comments, []);
  assert.equal(created.approvalHistory.length, 1);
  assert.equal(created.approvalHistory[0].action, "created");
  assert.equal(created.attachments[0].id, attachment.id);

  const fetched = await requestJson(`/documents/${created.id}`);
  assert.equal(fetched.id, created.id);

  const updated = await requestJson(
    `/documents/${created.id}`,
    jsonOptions("PUT", { title: "Contract smoke: updated", status: "approved" }),
    200,
    true,
  );
  assert.equal(updated.title, "Contract smoke: updated");
  assert.equal(updated.status, "draft");
  assert.equal(updated.attachments[0].id, attachment.id);

  const comment = await requestJson(
    `/documents/${created.id}/comments`,
    jsonOptions("POST", { author: "Alice Johnson", text: "Smoke-test comment" }),
    201,
    true,
  );
  assert.equal(comment.text, "Smoke-test comment");

  await requestJson(
    `/documents/${created.id}/approve`,
    jsonOptions("POST", { actor: "u2" }),
    409,
  );

  const submittedForApproval = await requestJson(
    `/documents/${created.id}/submit`,
    jsonOptions("POST", { actor: "u1" }),
    200,
    true,
  );
  assert.equal(submittedForApproval.status, "pending_approval");

  const approved = await requestJson(
    `/documents/${created.id}/approve`,
    jsonOptions("POST", { actor: "u2", comment: "Approved in smoke test" }),
    200,
    true,
  );
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvalHistory.at(-1).comment, "Approved in smoke test");

  const rejectionCandidate = await requestJson(
    "/documents",
    jsonOptions("POST", draft("Contract smoke: reject")),
    201,
    true,
  );
  await requestJson(
    `/documents/${rejectionCandidate.id}/submit`,
    jsonOptions("POST", { actor: "u1" }),
    200,
    true,
  );

  await requestJson(
    `/documents/${rejectionCandidate.id}/reject`,
    jsonOptions("POST", { actor: "u2", reason: "" }),
    400,
  );

  const rejected = await requestJson(
    `/documents/${rejectionCandidate.id}/reject`,
    jsonOptions("POST", { actor: "u2", reason: "Needs revision" }),
    200,
    true,
  );
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.approvalHistory.at(-1).comment, "Needs revision");

  const returnedToDraft = await requestJson(
    `/documents/${rejectionCandidate.id}/return-to-draft`,
    jsonOptions("POST", { actor: "u1" }),
  );
  assert.equal(returnedToDraft.status, "draft");

  // Sequential approvals: with two approvers, only the current one in line
  // may act, and one rejection anywhere rejects the whole document.
  const sequential = await requestJson(
    "/documents",
    jsonOptions("POST", {
      ...draft("Sequential smoke test"),
      approvers: [{ id: "u2", name: "Bob Martinez" }, { id: "u3", name: "Chen Wei" }],
    }),
    201,
    true,
  );
  await requestJson(
    `/documents/${sequential.id}/submit`,
    jsonOptions("POST", { actor: "u1" }),
    200,
    true,
  );
  await requestJson(
    `/documents/${sequential.id}/approve`,
    jsonOptions("POST", { actor: "u3" }),
    409,
  );
  const firstApproved = await requestJson(
    `/documents/${sequential.id}/approve`,
    jsonOptions("POST", { actor: "u2" }),
    200,
    true,
  );
  assert.equal(firstApproved.status, "pending_approval");
  assert.deepEqual(
    firstApproved.approvalSteps.map((step) => step.status),
    ["approved", "pending"],
  );
  const fullyApproved = await requestJson(
    `/documents/${sequential.id}/approve`,
    jsonOptions("POST", { actor: "u3" }),
    200,
    true,
  );
  assert.equal(fullyApproved.status, "approved");
  assert.deepEqual(
    fullyApproved.approvalSteps.map((step) => step.status),
    ["approved", "approved"],
  );

  // A rejection mid-sequence rejects the whole document, and a decided
  // approver cannot act again.
  const sequentialReject = await requestJson(
    "/documents",
    jsonOptions("POST", {
      ...draft("Sequential smoke test: reject"),
      approvers: [{ id: "u2", name: "Bob Martinez" }, { id: "u3", name: "Chen Wei" }],
    }),
    201,
    true,
  );
  await requestJson(
    `/documents/${sequentialReject.id}/submit`,
    jsonOptions("POST", { actor: "u1" }),
    200,
    true,
  );
  await requestJson(
    `/documents/${sequentialReject.id}/approve`,
    jsonOptions("POST", { actor: "u2" }),
    200,
    true,
  );
  const rejectedMidway = await requestJson(
    `/documents/${sequentialReject.id}/reject`,
    jsonOptions("POST", { actor: "u3", reason: "Budget line missing" }),
    200,
    true,
  );
  assert.equal(rejectedMidway.status, "rejected");
  assert.deepEqual(
    rejectedMidway.approvalSteps.map((step) => step.status),
    ["approved", "rejected"],
  );
  assert.equal(rejectedMidway.approvalSteps.at(-1).comment, "Budget line missing");
  await requestJson(
    `/documents/${sequentialReject.id}/approve`,
    jsonOptions("POST", { actor: "u2" }),
    409,
  );

  // Input hardening: reject payloads that would corrupt data or store XSS.
  await requestJson("/documents", jsonOptions("POST", { actor: "u1" }), 400);
  await requestJson(
    "/documents",
    jsonOptions("POST", { ...draft("Bad type"), documentType: "Meme" }),
    400,
  );
  await requestJson(
    "/documents",
    jsonOptions("POST", {
      ...draft("XSS attempt"),
      attachments: [{ name: "x.pdf", contentType: "application/pdf", size: 1, url: "javascript:alert(1)" }],
    }),
    400,
  );
  await requestJson(
    "/documents",
    jsonOptions("POST", { ...draft("Malformed approver"), approvers: [{ foo: 1 }] }),
    400,
  );
  await requestJson(
    "/documents",
    jsonOptions("POST", { ...draft("Read-only approver"), approvers: [{ id: "u4", name: "Dana Patel" }] }),
    400,
  );
  await requestJson(
    "/documents",
    jsonOptions("POST", { ...draft("Self approver"), approvers: [{ id: "u1", name: "Alice Johnson" }] }),
    400,
  );
  await requestJson(
    "/documents",
    jsonOptions("POST", {
      ...draft("Duplicate approver"),
      approvers: [{ id: "u2", name: "Bob Martinez" }, { id: "u2", name: "Bob Martinez" }],
    }),
    400,
  );

  // Approved and pending documents are frozen: PUT is only legal from draft
  // or rejected, so the audit trail cannot be rewritten after sign-off.
  await requestJson("/documents/d3", jsonOptions("PUT", { title: "Rewritten after approval" }), 409);
  await requestJson("/documents/d7", jsonOptions("PUT", { title: "Rewritten mid-review" }), 409);

  // A document's existing legacy attachments (d6 carries a deliberate
  // non-PDF) must not block editing; only newly added attachments are
  // validated.
  const legacyDoc = await requestJson("/documents/d6");
  const keptLegacy = await requestJson(
    "/documents/d6",
    jsonOptions("PUT", { title: legacyDoc.title, attachments: legacyDoc.attachments }),
    200,
    true,
  );
  assert.equal(keptLegacy.attachments.length, legacyDoc.attachments.length);
  await requestJson(
    "/documents/d6",
    jsonOptions("PUT", {
      attachments: [...legacyDoc.attachments, { name: "new.pdf", contentType: "text/html", size: 1, url: "https://x" }],
    }),
    400,
  );

  // Clearing a field persists: description:null must null the column.
  const clearable = await requestJson(
    "/documents",
    jsonOptions("POST", { ...draft("Clear description"), description: "to be removed" }),
    201,
    true,
  );
  const cleared = await requestJson(
    `/documents/${clearable.id}`,
    jsonOptions("PUT", { description: null }),
    200,
    true,
  );
  assert.equal(cleared.description, undefined);

  // Return-to-draft resets the live sequence: approvalSteps must be empty
  // again (the audit history keeps the decided steps).
  const resetDoc = await requestJson(
    "/documents",
    jsonOptions("POST", draft("Steps reset")),
    201,
    true,
  );
  await requestJson(`/documents/${resetDoc.id}/submit`, jsonOptions("POST", { actor: "u1" }), 200, true);
  await requestJson(
    `/documents/${resetDoc.id}/reject`,
    jsonOptions("POST", { actor: "u2", reason: "reset check" }),
    200,
    true,
  );
  const reset = await requestJson(
    `/documents/${resetDoc.id}/return-to-draft`,
    jsonOptions("POST", { actor: "u1" }),
    200,
    true,
  );
  assert.deepEqual(reset.approvalSteps, []);

  // Non-string bodies must 400, not crash the handler.
  const typeCheckDoc = await requestJson("/documents", jsonOptions("POST", draft("Type checks")), 201, true);
  await requestJson(`/documents/${typeCheckDoc.id}/submit`, jsonOptions("POST", { actor: "u1" }), 200, true);
  await requestJson(
    `/documents/${typeCheckDoc.id}/reject`,
    jsonOptions("POST", { actor: "u2", reason: 42 }),
    400,
  );
  await requestJson(
    `/documents/${typeCheckDoc.id}/comments`,
    jsonOptions("POST", { author: { name: "x" }, text: "hi" }),
    400,
  );

  // Hostile inputs must never crash a handler (500). Empty/wrong-typed
  // bodies and non-string actors previously threw on req.body access or the
  // SQLite bind.
  const fuzzBase = await requestJson("/documents", jsonOptions("POST", draft("Fuzz base")), 201, true);
  await requestJson(`/documents/${fuzzBase.id}/submit`, jsonOptions("POST", { actor: "u1" }), 200, true);
  const hostileBodies = [
    {},
    { actor: [] },
    { actor: {} },
    { actor: 123 },
    { actor: "u1", title: {} },
    { actor: "u1", approvers: "nope" },
    { actor: "u1", attachments: "no" },
  ];
  for (const body of hostileBodies) {
    for (const path of ["/documents", `/documents/${fuzzBase.id}/approve`, `/documents/${fuzzBase.id}/comments`]) {
      const response = await fetch(`${baseUrl}${path}`, jsonOptions("POST", body));
      assert.notEqual(response.status, 500, `500 on POST ${path} with ${JSON.stringify(body)}`);
      await response.json().catch(() => null);
    }
  }
  // A wrong content-type leaves the body unparsed; must be 400, not 500.
  const formPost = await fetch(`${baseUrl}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "actor=u1&title=x",
  });
  assert.equal(formPost.status, 400, "form-encoded body should be rejected cleanly");
  await formPost.json().catch(() => null);

  // SQL injection is stored as literal text and leaves the schema intact.
  const injection = await requestJson(
    "/documents",
    jsonOptions("POST", {
      ...draft("'; DROP TABLE documents;--"),
      customer: "Robert'); DROP TABLE users;--",
    }),
    201,
    true,
  );
  assert.ok(injection.title.includes("DROP TABLE"));
  const afterInjection = await requestJson("/documents");
  assert.ok(Array.isArray(afterInjection) && afterInjection.length > 0);

  // Concurrency: parallel approvals on the same step never double-apply.
  const raceDoc = await requestJson(
    "/documents",
    jsonOptions("POST", {
      ...draft("Concurrency"),
      approvers: [{ id: "u2", name: "Bob Martinez" }, { id: "u3", name: "Chen Wei" }],
    }),
    201,
    true,
  );
  await requestJson(`/documents/${raceDoc.id}/submit`, jsonOptions("POST", { actor: "u1" }), 200, true);
  const parallel = await Promise.all(
    Array.from({ length: 10 }, () =>
      fetch(`${baseUrl}/documents/${raceDoc.id}/approve`, jsonOptions("POST", { actor: "u2" })).then(async (r) => {
        await r.json().catch(() => null);
        return r.status;
      }),
    ),
  );
  assert.ok(parallel.filter((s) => s === 200).length <= 1, "at most one parallel approval may succeed");
  const raceResult = await requestJson(`/documents/${raceDoc.id}`);
  assert.equal(
    raceResult.approvalSteps.filter((s) => s.approver.id === "u2" && s.status === "approved").length,
    1,
    "exactly one approved step for the racing approver",
  );

  console.log("All documented API contracts passed.");
}

async function cleanUp() {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
  fs.rmSync(databasePath, { force: true });
  for (const filePath of uploadedFilePaths) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanUp);
