# Document Approval Portal

## The product

Build a web application that helps teams create documents, send them for
approval, review their progress, and maintain a clear history of decisions.

Users should be able to:

- Find and review documents efficiently.
- Create and edit document information.
- Submit documents for approval.
- Approve or reject documents when authorized.
- Understand a document's current state and approval history.
- Recover gracefully from validation, permission, and server errors.

We care about a clear, dependable user experience rather than pixel-perfect
visual design. Before implementation, review the requirements, identify
ambiguities, and document the important assumptions and trade-offs in your
approach.

## Core workflow

A document contains an ID, title, document type, customer, created date,
owner, priority, approvers, comments, attachments, and approval history. Its
status is one of Draft, Pending Approval, Approved, or Rejected.

The normal workflow is:

| Current status | Available actions |
| --- | --- |
| Draft | Edit, submit |
| Pending Approval | Approve, reject |
| Approved | View |
| Rejected | Edit, resubmit |

Only users with the `approver` role can approve or reject. Read-only users
must not be offered mutating actions.

### Document field guide

The fields describe a business document that needs to move through the
approval process. They are not the contents of the uploaded document itself.

| Field | Meaning and expected value | Set by |
| --- | --- | --- |
| ID | Stable unique identifier used in URLs and API requests. | System |
| Title | Short, human-readable name that helps users recognize the document, such as “Northwind renewal agreement”. Required. | Creator |
| Document type | Business category used to organize and filter documents. Choose one of `Contract`, `Invoice`, `Proposal`, `Report`, `Policy`, or `Other`. `Other` covers documents that do not fit the named categories. Required. | Creator |
| Customer | Organization or business party the document concerns. Use `Internal` when it is not associated with an external customer. Required. | Creator |
| Created date | Date and time when the record was first created. It does not change when the document is edited. | System |
| Owner | User responsible for the document. For this exercise, this is the user who creates it. | System from current user |
| Status | Current workflow state: `Draft`, `Pending Approval`, `Approved`, or `Rejected`. It changes only through workflow actions, not ordinary form editing. | System from workflow action |
| Priority | Relative business urgency: `Low`, `Medium`, or `High`. It helps users decide what to review first; it does not automatically change workflow behavior. Required. | Creator |
| Description | Optional plain-text context explaining what the document is and why approval is needed. | Creator |
| Approvers | One or more users expected to review the document. This assignment uses the list for display and permission-aware workflow behavior; approval is not sequential unless stated otherwise. Required. | Creator |
| Due date | Optional target date by which approval should be completed. It is informational and does not automatically reject or escalate a document. When supplied, it must not be earlier than the creation date. | Creator |
| Comments | Discussion added after creation. Each comment records its author, text, and creation time and does not change the document status. | Users through comment action |
| Attachments | Optional PDF files associated with a record, represented by name, MIME type, size, and URL. PDF is the only supported format. Every attachment must be viewable in the application. | Creator/API |
| Approval history | Read-only audit trail of workflow actions, including action, actor, time, and an optional comment or rejection reason. | System from workflow action |

Some older records intentionally omit optional fields. The UI should present
their absence gracefully rather than treating it as an error.

## What to build

### Find documents

Provide a document list with search, sorting, pagination, and filtering by
status, document type, owner, and date. Preserve the list state in the URL so
that a view can be refreshed or shared, for example:

```text
/documents?status=pending&owner=u2&page=2
```

Include useful loading, empty, and error states.

### Review a document

Let a user inspect document metadata, current status, approval history,
comments, and attachments. Show only actions that are valid for both the
document's current status and the current user's role.

The details experience may use a separate page or another interaction pattern
that you consider appropriate.

Attachments are optional, but PDF is the only permitted attachment format.
When a document has attachments, the user must be able to open and read each
PDF without leaving the application. The rendering approach and interaction
are your decision. The preview should remain usable on mobile, provide an
accessible name, and show a clear fallback if the file cannot be rendered or
loading fails. Advanced PDF editing, annotation, and text extraction are not
required.

The seed data includes working PDF URLs so this behavior can be implemented
and demonstrated. The application should treat an attachment whose MIME type
is not `application/pdf` as invalid data rather than trying to display it.

### Complete approval work

Support submitting a draft, approving a pending document, rejecting it with a
mandatory reason, returning it to draft, and adding comments. Confirm
destructive actions and communicate failures without losing the user's work.

### Create and edit documents

The form must support title, customer, document type, priority, description,
approvers, due date, and an optional PDF attachment. Include required-field,
date, PDF type, and file-size validation, an unsaved-change warning, upload
progress or pending feedback, and clear handling of server-side errors.

Creating a document means creating its metadata and workflow record. A newly
created document starts as a draft and may include an uploaded PDF. Only valid
PDFs up to 10 MB are accepted. A failed upload must not create a document that
refers to a missing file.

### Design for appropriate reuse

Several parts of the product share concepts and behavior, including document
status, user selection, validation, feedback, and workflow actions. Identify
where reuse improves consistency and maintainability, and create shared
components, hooks, or utilities where appropriate.

We are evaluating your judgment, not the number of abstractions you create.
Avoid both duplicating meaningful behavior and creating generic abstractions
that have no clear use. Explain the important reuse boundaries in
`DESIGN.md`.

### Work across screen sizes

The application must remain usable on mobile devices as well as desktop. At a
minimum:

- Navigation, forms, filters, dialogs, and workflow actions must fit and
  remain operable at a 320px viewport width.
- Content must not cause unintended page-level horizontal scrolling.
- Dense document data must have a deliberate responsive treatment.
- Controls must have readable labels and usable touch targets, and keyboard
  focus must remain visible.

We will assess whether the chosen mobile treatment preserves the important
workflow, not whether it matches a particular visual design.

### Support multiple languages

The user interface must support English, Finnish, and Swedish. Users must be
able to select their preferred language.

### Test important behavior

Add focused unit tests for the behavior you consider most important. We are
interested in what you choose to test, why you chose it, and whether the tests
give useful confidence. Broad automation, end-to-end testing, and a particular
coverage percentage are not required.

### Document your decisions

Create a separate `DESIGN.md` as part of your submission. This is a required
deliverable and is evaluated alongside the implementation. Use it to explain:

- Your understanding of the product and the assumptions you made.
- The important design and technical decisions you made and why.
- How you approached reuse, testing, and the main product constraints.
- Meaningful trade-offs or alternatives you considered.
- Known limitations, and the top 3 improvements you would prioritize next
  with more time, and why each one is a priority.

Keep this focused on decisions and reasoning; it should not be a file-by-file
description of the code. You should be prepared to explain and defend these
decisions during the review.

## Technical starting point

The repository includes a React and TypeScript application shell, a mock HTTP
API with realistic sample data, basic domain types, and simulated users and
roles. These are provided so the first phase can focus on the frontend rather
than backend plumbing.

The supplied code is a starting point, not a required application
architecture. You may reorganize the frontend and select additional libraries
where useful. Avoid building a speculative replacement backend during the
first phase; work against the documented HTTP contract.

**Important:** do not modify the mock API's seed data, existing users, or its
documented endpoints and behavior (`mock-api/db.json`, `mock-api/server.js`).
Treat them as a fixed fixture for this phase and build only against the
documented HTTP contract above.

### Running the project

Node.js 18 or later is required.

```bash
npm run install:all
npm run dev
```

This starts the mock API at `http://localhost:4000` and the web application at
`http://localhost:5173`. The web app reads `VITE_API_BASE_URL` and defaults to
the local API when it is unset.

The mock API adds latency and occasionally fails write requests so that
loading and failure states can be exercised.

### API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/documents` | List documents |
| `GET` | `/documents/:id` | Get one document; returns 404 when absent |
| `POST` | `/documents` | Create a draft |
| `PUT` | `/documents/:id` | Update editable fields |
| `POST` | `/uploads` | Upload one PDF as multipart field `file`; returns attachment metadata |
| `POST` | `/documents/:id/submit` | Move Draft to Pending Approval; body `{ actor }` |
| `POST` | `/documents/:id/approve` | Move Pending to Approved; body `{ actor, comment? }` |
| `POST` | `/documents/:id/reject` | Move Pending to Rejected; body `{ actor, reason }` |
| `POST` | `/documents/:id/return-to-draft` | Move Rejected to Draft; body `{ actor }` |
| `POST` | `/documents/:id/comments` | Add a comment; body `{ author, text }` |
| `GET` | `/users` | List the simulated users |

The list endpoint returns all documents. Write requests can return simulated
`500` errors, and invalid workflow transitions return a conflict response.
Uploaded PDFs are stored locally by the mock service and served from the URL
returned by `/uploads`; this is development storage, not a production design.

## Submission deliverables

- A working implementation of the required product behavior.
- Focused unit tests that can be run with a documented command.
- `DESIGN.md` containing the required design and technical decisions.
- Updated setup instructions if you changed the supplied setup.
- Meaningful commit history and a short summary of incomplete work, if any.
- Any coding-assistant configuration you set up and used (for example claude.md files, project instructions or custom agents for development, code quality, or testing), included in your submission.


## A possible second phase

This exercise may continue with a second, separately scoped phase. In that
phase, you may be asked to evolve or replace part of the supplied backend for
an additional business requirement.

The exact requirement will be provided at that time. It will be designed so a
well-structured first-phase solution can be adapted within approximately one
week. Do not attempt to predict or pre-build it. We will be interested in how
you clarify the new requirement, evolve the data and API design, preserve
existing behavior, test the change, and communicate trade-offs.


## Out of scope for the first phase

Do not build real authentication, a custom production backend, production
file storage, email delivery, websockets, or a pixel-perfect design. The user
selector represents authentication for this exercise.

**Do not modify the mock API's seed data, existing users, or its documented
endpoints and behavior** (`mock-api/db.json`, `mock-api/server.js`). Treat
them as a fixed fixture for this phase and build only against the documented
HTTP contract above.

## Added in this submission

- `npm test` (from the root or `web/`) runs the unit and integration test
  suite (Vitest + Testing Library + MSW). `npm run test:watch --prefix web`
  for watch mode.
- `npm run lint` and `npm run typecheck` run oxlint and `tsc -b` for `web/`.
- `DESIGN.md` documents assumptions, decisions, reuse boundaries, testing
  rationale, and known limitations.
- `CLAUDE.md` contains the coding-assistant configuration used during
  development.
- New frontend dependencies: `@tanstack/react-query` (server state),
  `i18next` + `react-i18next` (EN/FI/SV), and dev-only test tooling
  (`vitest`, `@testing-library/*`, `msw`, `jsdom`). Setup commands are
  unchanged: `npm run install:all && npm run dev`.
