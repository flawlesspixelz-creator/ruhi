# DESIGN.md — Document Approval Portal

This document explains the assumptions, decisions, and trade-offs behind the
implementation — the first phase (the frontend against a fixed mock API) and
the second phase (sequential approvals on a persistent datastore). It focuses
on reasoning, not a file-by-file tour.

## Product understanding and assumptions

The portal moves business documents through a Draft → Pending Approval →
Approved/Rejected workflow with an auditable history. In the first phase the
mock API was a fixed fixture and every behavior was built against the
documented HTTP contract only; the second phase lifted that constraint to
support ordered multi-approver flows (see "Second phase" below).

The brief leaves some permission questions open. The assumptions made, all
centralized in `web/src/domain/permissions.ts` so they can be changed in one
place:

- **Who can create a new document?** Any user except `read-only`, so both
  `creator` and `approver` roles can originate documents. Read-only users
  cannot mutate at all, per the brief; nothing in the brief restricts
  authoring to the `creator` role specifically, and treating creator and
  approver as one collaborative team matches the same reasoning already used
  for editing an existing draft (next point). Centralized as
  `canCreateDocument()` in `domain/permissions.ts` and consumed by
  `DocumentListPage` (the New document action) and `DocumentFormPage` (the
  guard on `/documents/new`) — no inline role checks in either page.
- **Who can edit/submit a draft?** Any user except read-only ones, not just
  the owner. The brief never restricts editing to the owner, and the seed
  data shows why owner-only would be fragile: d3, d5, and d7 are owned by
  Dana Patel, a read-only user who cannot mutate anything. None of those is
  in an editable status today (two are approved, one is pending), but the
  moment one reaches draft or rejected — d7 is one rejection away — an
  owner-only rule would strand it with no user able to edit or resubmit it.
  Treating creators and approvers as one collaborative team for *existing*
  drafts keeps the workflow unblocked without inventing a reassignment
  feature the brief doesn't ask for.
- **Who can approve/reject?** Only the approver whose turn it is: the first
  step still pending in the document's ordered approval sequence, provided
  they hold the `approver` role. Assigned approvers later in the order must
  wait — the UI hides the actions and the server rejects out-of-turn requests
  with a conflict. (Phase one allowed any assigned approver; the sequence
  reduces to exactly that behavior for single-approver documents.)
- **Comments are mutating**, so read-only users cannot add them ("read-only
  users must not be offered mutating actions"). They see all content.
- **Rejected documents offer Edit and Return to draft**, matching the
  brief's workflow table (`Rejected: Edit, resubmit`). Editing in place is
  legal (`PUT` works on any status and editing never changes status);
  *resubmission* is Return to draft → submit, because the API only accepts
  `submit` from `draft`, and the extra transition keeps the audit trail
  honest.
- **Self-review is prevented entirely.** An assigned approver who also owns
  a pending document gets neither "approve" nor "reject" — even when their
  step comes up in the sequence. Deciding the outcome of your own document
  either way is the conflict of interest, not just the positive outcome.
  They can still comment. Enforced in `getAvailableActions` in
  `domain/permissions.ts`, so the buttons are simply absent rather than
  disabled; the server does not enforce this rule itself, so a direct API
  call could still bypass it (a known limitation).
- **A document's owner can never be selected as one of its own approvers.**
  This is the same conflict self-review guards against, caught earlier: the
  create/edit form filters the owner (the creator on a new document, the
  existing owner when editing) out of the approver checklist entirely via
  `isEligibleApprover()`, so the pairing can't be created in the first place
  rather than only being blocked later at approve/reject time.
- The user selector is simulated authentication; switching user is switching
  identity, and the UI re-evaluates permissions immediately.

## Second phase: sequential approvals

**What "in order" means here.** The requirement said multi-approver documents
must be approved "in a specific order" without defining the order's source.
The assumptions landed on:

- **The order is the approvers list itself.** The form already lets the
  author choose and arrange approvers; inventing a second ordering control
  would duplicate that concept. The list order is the approval order.
- **The sequence is frozen at submit.** Submitting builds one pending step
  per approver, in list order (`approvalSteps`). Editing a pending
  document's approvers does *not* alter the in-flight round — a decided
  step is an audit fact, and mutating the queue mid-round would let an
  author skip an inconvenient approver. The next submit rebuilds the
  sequence from the then-current list.
- **A rejection at any step rejects the whole document**, per the brief. The
  steps behind the rejecting approver are simply never reached in that
  round. Return to draft → resubmit starts a fresh round: earlier approvals
  do not carry over, because the document may have changed since they were
  given.
- **Single-approver documents keep phase-one behavior** — their sequence is
  one step, so "the current approver" is "the assigned approver".
- **Turn enforcement lives in both layers.** The server is authoritative: it
  refuses out-of-turn approve/reject with a `409` conflict. The client
  mirrors the same rule (`currentApprover()` in `domain/permissions.ts`) so
  approvers who must wait see no actions they cannot take, per the brief's
  "show only actions that are valid". If a pending document somehow carries
  no steps (data created outside the submit flow), the client falls back to
  the phase-one rule rather than dead-ending the document — the server still
  validates whatever is attempted.
- **The workflow states did not change.** A partially approved document is
  still `pending_approval`; per-step progress is data (`approvalSteps`), not
  new statuses. This keeps every existing filter, badge, and transition
  working unchanged.

**Data model and API evolution.** Documents gained `approvalSteps` — ordered
step objects (`approver`, `status`, `decidedAt`, `comment`) that `submit`
creates and `approve`/`reject` advance. It is server-owned: clients never
send it, `POST`/`PUT` ignore it. On the wire, workflow endpoints identify the
acting user by **id** (`actor: "u2"`); the server resolves display names for
the audit trail and validates the turn against the step's user id. The
documented endpoints all kept their paths and verbs; the only observable
changes are the new field, the turn-order conflict, and stricter payload
handling (`owner` derived from `actor` at creation, `PUT` ignoring
system-owned fields) — hardening that phase one's fixture rule prevented.

**Datastore: SQLite via better-sqlite3.** The brief required replacing
`db.json`/json-server with a real, persistent datastore. SQLite fits this
product's actual scale: a single durable file, zero server administration
for reviewers running the project, real SQL with transactions, and
`better-sqlite3`'s synchronous API keeps the Express handlers as simple as
the json-server versions they replaced. Comments, attachments, and approval
history are proper child tables (they grow independently and are queried as
lists), while `approvers` and `approvalSteps` are JSON columns on the
document row: the sequence is a small ordered value object that is always
read and written atomically with its document, and never queried across
documents. The trade-off — no SQL over step contents — costs nothing today;
promoting steps to a table is a contained change if reporting ever needs it.

## Architecture

```
web/src/
  domain/       pure business logic: permissions (incl. approval turn),
                list filtering/sorting/pagination, URL state codec,
                form/file validation
  api/          typed HTTP client and endpoint functions (supplied, extended)
  hooks/        TanStack Query wrappers, URL list state, unsaved-changes
                guard, viewport-derived page size
  context/      simulated authentication: the current-user provider every
                permission check reads from
  components/   shared UI: StatusBadge, ConfirmDialog, Toast, Feedback,
                Pagination, FormField, PdfAttachmentList, QuickApproveReject,
                selectors
  pages/        route-level composition (list, detail, form, 404)
  utils/        presentation helpers: date/size formatting, date-input
                validity (framework-free, unit-tested)
  types/        shared domain types (ApprovalDocument, ApprovalStep, users)
  i18n/         i18next setup + en/fi/sv resource files
  test/         MSW server, fixtures, and the render helper used by
                integration tests
mock-api/       Express + SQLite mock service (schema and seed in db.js)
```

The key boundary is **domain vs. React**. Everything the business cares about
— who may do what, whose turn it is, how filtering behaves, what makes a form
valid — is a pure function with no React, DOM, or network dependency. Pages
compose these with data hooks and shared components. This is also what makes
the important behavior cheap to test exhaustively; the sequential-approval
rules landed as new cases in the existing permission matrix, not as component
logic.

## Key technical decisions

**TanStack Query for server state.** The mock API adds latency and randomly
fails writes, so caching, request deduplication, read retries, and
invalidation after mutations are core requirements, not conveniences.
Hand-rolling that state machine would be more code and less reliable. Reads
retry automatically; **mutations never do** — every write is user-confirmed,
and auto-retrying a workflow action could double-apply it (or mask the
conflict responses the API intentionally returns, including "not your
turn"). After any workflow mutation the detail cache is updated from the
response and the list is invalidated.

**URL as the single source of truth for the list.** `useUrlListState` parses
`searchParams` into a typed state and writes changes back, so refresh,
back/forward, and shared links all work with zero extra state. Junk values
are silently dropped, and the README's `?status=pending` alias is accepted.
Any filter change resets pagination so users are never left on an empty page.

**Client-side filtering/sorting/pagination.** `GET /documents` returns the
full collection, so the list pipeline (`domain/documentList.ts`) runs in
memory: deterministic, instant, and unit-testable, including edge cases like
documents missing a due date (they always sort last) and out-of-range pages
(clamped, not empty). If the dataset grew, this module is the seam where a
server-side query would slot in.

**Manual controlled form.** With eight fields, a form library adds a
dependency without carrying its weight. Validation is a pure function
returning i18n error keys, shared by the form and its tests. Dirty tracking
compares against the initial snapshot; a ref-based navigation blocker plus
`beforeunload` covers both in-app and browser-level leave events without a
race between "saved" state and navigation.

**Upload-first save flow.** When a PDF is selected, saving uploads it first
(XHR, for progress events) and only then creates/updates the document with
the returned attachment metadata. A failed upload aborts the save with an
explanation — a document can never reference a missing file. Server failures
on save keep every field intact.

**PDF preview via the browser's native viewer** in an `<iframe>`, toggled per
attachment, with a persistent "open in a new tab" link as the fallback path.
A pdf.js integration would add a large dependency for capability the browser
already has; the brief's requirements (view in-app, accessible name, mobile
usable, graceful failure) are all met without it. Attachments whose MIME type
is not `application/pdf` are displayed as invalid data and never rendered.

**Native `<dialog>` for confirmations**, giving focus trapping, Escape
handling, and top-layer stacking from the platform instead of a library.
Reject requires a reason before any request is sent; failures render inside
the dialog and preserve what the user typed.

**Quick approve/reject from the list.** A PR reviewer flagged that approving
a document required opening its detail page first. The list now renders
Approve/Reject on each row where the current user may act. The permission
decision stays outside the component — the row asks `getAvailableActions`
and only then renders `QuickApproveReject`, which owns the interaction
(confirm dialog, mandatory reject reason, preserved input on failure, toast)
and no rules. Because the check is the shared permission matrix, the quick
actions became turn-aware in phase two without touching the component at
all. The column itself is gated on role, not per-row, so it doesn't appear
and disappear as the page's data changes.

**i18n with react-i18next.** All UI strings live in en/fi/sv resource files;
no component holds a literal. Two rules keep the three locales honest: every
new key is added to all three files in the same change (they currently hold
an identical 162-key set), and *validation returns i18n keys rather than
display strings*, so error copy is translated at render time instead of
being baked into domain logic — which is also what lets the validation unit
tests assert on stable keys. Dates and file sizes format through `Intl` with
the active locale rather than hand-rolled formatting, so Finnish and Swedish
date order comes for free; i18next's plural handling covers count-dependent
copy. The language choice persists in localStorage, falls back to the
browser language, and sets `<html lang>` so screen readers switch voice.
Resources are bundled eagerly: three small JSON files are not worth a
loading state or a flash of untranslated text, though lazy loading is the
obvious change if locales multiply.

**Approval progress as a first-class section.** The detail page renders the
ordered sequence — who has approved (when, with what comment), who is
awaiting a decision, who is queued — as its own list above the description,
with the active step visually highlighted and marked `aria-current="step"`.
The approval history alone can't communicate a sequence: it records what
happened, not who is *next*, which is the question sequential approvals
introduce. Drafts show no sequence (none exists until submit).

## Reuse boundaries

Shared where the product concept is genuinely shared:

- `domain/permissions.ts` — one action matrix feeds the detail page's action
  bar, the list's quick actions and "New document" visibility, and the edit
  route guard. This is the most important reuse in the app: no component
  decides permissions, which is why sequential turn order was a one-place
  change.
- `StatusBadge`, `ConfirmDialog`, `Toast`, `FormField`, feedback states
  (loading/empty/error), `Pagination` — consistent UX for concepts that
  appear on multiple screens.
- `useUsersQuery` backs the header selector, the owner filter, and the
  approver picker — one source for "people".

`QuickApproveReject` is the deliberate exception to the one-consumer rule
below: only the list renders it, so it is extraction for *encapsulation*
rather than reuse — it keeps a complete confirm-and-mutate interaction
(mandatory reject reason, preserved input on failure, toast on success) out
of an already dense list page, and guarantees that interaction stays
identical to the detail page's version. What is genuinely shared between the
two screens is `getAvailableActions`, not the component.

Deliberately **not** abstracted: the three pages compose rather than share a
generic "resource page" scaffold; the approver checkbox group and the
approval-progress section live in their single consumers; the workflow
action buttons are not a config-driven engine. Those abstractions would have
one consumer each today and would mostly encode guesses about future phases.

## Testing approach

Vitest + Testing Library + MSW; 88 tests, plus a mock-API contract smoke
test. The selection principle: test the behavior whose failure would corrupt
the workflow or lose user work, at the lowest level that gives real
confidence.

- **Permission matrix (unit, exhaustive)** — every status × role combination,
  including the traps: unassigned approvers, creators listed as approvers,
  read-only users assigned as approvers, and an assigned approver who owns
  the document (loses both approve and reject). Phase two added the
  sequential cases: only the first pending step's approver may act, the turn
  advances after a decision, self-review stays blocked when the owner's turn
  comes up, a rejected document offers no approvals despite unreached
  pending steps, and a stepless pending document falls back to phase-one
  behavior.
- **List pipeline (unit)** — filter semantics, inclusive date boundaries
  (anchored to UTC so the cutoff doesn't shift with the viewer's timezone),
  priority rank ordering, null due dates last in both directions, stable
  tie-breaks, page clamping. **URL codec** — alias handling, junk rejection
  (including impossible calendar dates), round-tripping.
- **Validation (unit)** — required fields, due-date boundary (equal to
  creation date is valid), PDF type/size limits at the 10 MB boundary.
- **Integration (MSW, real router + providers)** — the flows that string
  everything together: role-dependent action visibility; turn-dependent
  visibility on a two-approver document (current approver sees actions, the
  queued one does not) and the progress section marking the active step;
  reject requiring a reason *before* any request and preserving the typed
  reason on a simulated 500; list filtering from a shared URL; error state
  with working retry; create posting the right payload (actor as user id)
  and navigating; upload failure provably *not* creating a document; the
  unsaved-changes dialog blocking navigation.
- **Mock API smoke test (`npm run smoke`)** — exercises the real server and
  SQLite store end to end against the documented contract: uploads,
  creation-payload hardening, and the sequential rules (out-of-turn 409,
  in-order approval reaching Approved, mid-sequence rejection rejecting the
  whole document, decided approvers unable to act again). The server owns
  turn enforcement, so it is tested where it lives, not through the UI.

Not covered on purpose: E2E browser automation (excluded by the brief) and
visual styling.

One infra caveat: `uploadPdf` uses a raw XHR (for upload-progress events,
which `fetch` can't provide). MSW's node XHR interceptor doesn't resolve
`FormData`-bodied requests under jsdom, so the one test exercising a failed
upload mocks `uploadPdf` directly instead of a real intercepted request —
every other network call in the suite goes through MSW's real interception.

Run with: `npm test` (web) and `npm run smoke` (API) from the repository
root, or `npm run test:watch --prefix web` during work.

## Trade-offs and alternatives considered

- **TanStack Query vs. hand-rolled hooks**: chose the dependency; the flaky
  API makes its retry/cache/invalidation behavior directly load-bearing.
- **JSON step column vs. a normalized steps table**: chose the JSON column;
  steps are an atomic, ordered part of one document and never queried across
  documents. A table earns its keep when steps need reporting or independent
  writes — a contained migration if it comes.
- **Freezing the sequence at submit vs. tracking live approver edits**:
  chose freezing; an approval round should be judged against the document
  and queue that were submitted, and mid-round queue edits would enable
  approver-skipping. The cost is that fixing a wrong approver list requires
  a new round via return-to-draft.
- **No new workflow statuses for partial approval**: `pending_approval`
  plus step data covers it; new statuses would ripple through every filter,
  badge, translation, and transition for no added meaning.
- **pdf.js vs. native viewer**: chose native + fallback link; pdf.js gives
  pixel-identical rendering everywhere at the cost of ~1 MB and upgrade
  churn. The seam (one component) makes swapping later cheap.
- **Sortable headers + a mobile sort select** instead of one control: slight
  duplication, but table headers are the natural desktop affordance and are
  unusable once the table collapses to cards.
- **Card collapse below 720 px** for the dense table rather than horizontal
  scrolling: preserves scanability of the fields users act on (status,
  priority, due date) at 320 px; the trade-off is losing column comparison on
  phones, which the sort select compensates for.
- Toast + inline errors both exist: inline for recoverable, contextual
  failures (dialogs, form fields), toasts for confirmations of completed
  actions.

## Known limitations and next priorities

Limitations: search matches title/customer/owner only; single new attachment
per save (existing ones can be removed individually); no optimistic updates
(every action waits for the server); language files are bundled eagerly;
list data can be up to 30 s stale after external changes; self-review
(approve/reject on your own document) is blocked client-side only — the
server enforces turn order but not owner-approver conflicts, so a direct
API call could still bypass that rule; on a rejected document the unreached
steps read "waiting for their turn" although that round will never resume,
which is slightly imprecise wording.

Top 3 next improvements, in order:

1. **Concurrency safety.** Two users acting on the same document can race;
   the loser currently just sees a conflict error. Sequential approvals
   raise the stakes: the turn can change between render and click. Adding a
   version/ETag to the contract plus a "this document changed, reload?" flow
   protects the audit trail — the core asset of an approval product.
2. **Accessibility pass with assistive tech.** The foundations are in
   (labels, aria-sort, aria-invalid/describedby, focus visibility, dialog
   semantics, `aria-current` on the active approval step), but a
   screen-reader walkthrough of the reject flow, the approval sequence, and
   the card-collapsed table would surface real issues automated checks miss.
3. **Optimistic updates with rollback** for comments and workflow actions.
   With the API's injected latency every click costs ~400 ms+; optimistic
   UI makes the app feel instant and TanStack Query already provides the
   rollback machinery — but it must come after (1), since optimism without
   conflict detection can show users state that never committed.
