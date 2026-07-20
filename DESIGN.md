# DESIGN.md — Document Approval Portal

This document explains the assumptions, decisions, and trade-offs behind the
first-phase implementation. It focuses on reasoning, not a file-by-file tour.

## Product understanding and assumptions

The portal moves business documents through a Draft → Pending Approval →
Approved/Rejected workflow with an auditable history. The mock API is a fixed
fixture, so every behavior is built against the documented HTTP contract only.

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
  the owner. The seed data forces this choice: documents d3, d5, and d7 are
  owned by Dana Patel, a read-only user. If editing were owner-only, those
  documents could never be edited by anyone. Treating creators and approvers
  as one collaborative team for *existing* drafts matches the data and keeps
  the workflow unblocked.
- **Who can approve/reject?** Only users with the `approver` role **and**
  who are assigned in the document's approvers list. The brief says the
  approvers list drives "permission-aware workflow behavior", so an
  unassigned approver seeing approve buttons would contradict it.
- **Comments are mutating**, so read-only users cannot add them ("read-only
  users must not be offered mutating actions"). They see all content.
- **Rejected documents offer Edit and Return to draft**, matching the
  brief's workflow table (`Rejected: Edit, resubmit`). Editing in place is
  legal (`PUT` works on any status and editing never changes status);
  *resubmission* is Return to draft → submit, because the API only accepts
  `submit` from `draft`, and the extra transition keeps the audit trail
  honest.
- **Self-review is prevented entirely.** An assigned approver who also owns
  a pending document gets neither "approve" nor "reject" — deciding the
  outcome of your own document either way is the conflict of interest, not
  just the positive outcome. They can still comment and must wait for
  another assigned approver to act. Enforced in `getAvailableActions` in
  `domain/permissions.ts`, so the buttons are simply absent rather than
  disabled; the mock API doesn't enforce this itself (it's a fixed fixture),
  so the rule only exists client-side.
- **A document's owner can never be selected as one of its own approvers.**
  This is the same conflict self-review guards against, caught earlier: the
  create/edit form filters the owner (the creator on a new document, the
  existing owner when editing) out of the approver checklist entirely via
  `isEligibleApprover()`, so the pairing can't be created in the first place
  rather than only being blocked later at approve/reject time.
- The user selector is simulated authentication; switching user is switching
  identity, and the UI re-evaluates permissions immediately.

## Architecture

```
web/src/
  domain/       pure business logic: permissions, list filtering/sorting/
                pagination, URL state codec, form/file validation
  api/          typed HTTP client and endpoint functions (supplied, extended)
  hooks/        TanStack Query wrappers, URL list state, unsaved-changes guard
  components/   shared UI: StatusBadge, ConfirmDialog, Toast, Feedback,
                Pagination, FormField, PdfAttachmentList, selectors
  pages/        route-level composition (list, detail, form, 404)
  i18n/         i18next setup + en/fi/sv resource files
```

The key boundary is **domain vs. React**. Everything the business cares about
— who may do what, how filtering behaves, what makes a form valid — is a pure
function with no React, DOM, or network dependency. Pages compose these with
data hooks and shared components. This is also what makes the important
behavior cheap to test exhaustively.

## Key technical decisions

**TanStack Query for server state.** The mock API adds latency and randomly
fails writes, so caching, request deduplication, read retries, and
invalidation after mutations are core requirements, not conveniences.
Hand-rolling that state machine would be more code and less reliable. Reads
retry automatically; **mutations never do** — every write is user-confirmed,
and auto-retrying a workflow action could double-apply it (or mask the
conflict responses the API intentionally returns). After any workflow
mutation the detail cache is updated from the response and the list is
invalidated.

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
a document required opening its detail page first. The list now shows
Approve/Reject directly on each row for an approver who can act on that
row's document, using the same `getAvailableActions` check and the same
confirm-and-mutate pattern (mandatory reject reason, preserved input on
failure) as the detail page, via a small shared `QuickApproveReject`
component. The column itself is gated on role, not per-row, so it doesn't
appear and disappear as the page's data changes.

**i18n with react-i18next.** All UI strings live in en/fi/sv resource files;
dates and file sizes format through `Intl` with the active locale. The choice
persists in localStorage and falls back to the browser language. i18next's
plural handling covers count-dependent copy.

## Reuse boundaries

Shared where the product concept is genuinely shared:

- `domain/permissions.ts` — one action matrix feeds the detail page's action
  bar, the list's "New document" visibility, and the edit route guard. This
  is the most important reuse in the app: no component decides permissions.
- `StatusBadge`, `ConfirmDialog`, `Toast`, `FormField`, feedback states
  (loading/empty/error), `Pagination`, `QuickApproveReject` — consistent UX
  for concepts that appear on multiple screens.
- `useUsersQuery` backs the header selector, the owner filter, and the
  approver picker — one source for "people".

Deliberately **not** abstracted: the three pages compose rather than share a
generic "resource page" scaffold; the approver checkbox group lives in the
form because it has exactly one caller; the workflow action buttons are not a
config-driven engine. Those abstractions would have one consumer each today
and would mostly encode guesses about phase two.

## Testing approach

Vitest + Testing Library + MSW; 77 tests. The selection principle: test the
behavior whose failure would corrupt the workflow or lose user work, at the
lowest level that gives real confidence.

- **Permission matrix (unit, exhaustive)** — every status × role combination,
  including the traps: unassigned approvers, creators listed as approvers,
  read-only users assigned as approvers, and an assigned approver who owns
  the document (loses both approve and reject).
- **List pipeline (unit)** — filter semantics, inclusive date boundaries,
  priority rank ordering, null due dates last in both directions, stable
  tie-breaks, page clamping. **URL codec** — alias handling, junk rejection,
  round-tripping.
- **Validation (unit)** — required fields, due-date boundary (equal to
  creation date is valid), PDF type/size limits at the 10 MB boundary.
- **Integration (MSW, real router + providers)** — the flows that string
  everything together: role-dependent action visibility; reject requiring a
  reason *before* any request and preserving the typed reason on a simulated
  500; list filtering from a shared URL; error state with working retry;
  create posting the right payload and navigating; upload failure provably
  *not* creating a document; the unsaved-changes dialog blocking navigation.

Not covered on purpose: E2E browser automation (excluded by the brief),
visual styling, and the mock API itself (a fixture).

One infra caveat: `uploadPdf` uses a raw XHR (for upload-progress events,
which `fetch` can't provide). MSW's node XHR interceptor doesn't resolve
`FormData`-bodied requests under jsdom, so the one test exercising a failed
upload mocks `uploadPdf` directly instead of a real intercepted request —
every other network call in the suite goes through MSW's real interception.

Run with: `npm test --prefix web` (or `npm run test:watch` during work).

## Trade-offs and alternatives considered

- **TanStack Query vs. hand-rolled hooks**: chose the dependency; the flaky
  API makes its retry/cache/invalidation behavior directly load-bearing.
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
(approve/reject on your own document) is blocked client-side only, so a
direct API call could still bypass it since the mock API is a fixed
fixture that doesn't enforce the rule.

Top 3 next improvements, in order:

1. **Concurrency safety.** Two users acting on the same document can race;
   the loser currently just sees a conflict error. Adding a version/ETag to
   the contract (phase two) plus a "this document changed, reload?" flow
   protects the audit trail — the core asset of an approval product.
2. **Accessibility pass with assistive tech.** The foundations are in
   (labels, aria-sort, aria-invalid/describedby, focus visibility, dialog
   semantics), but a screen-reader walkthrough of the reject flow and the
   card-collapsed table would surface real issues automated checks miss.
3. **Optimistic updates with rollback** for comments and workflow actions.
   With the API's injected latency every click costs ~400 ms+; optimistic
   UI makes the app feel instant and TanStack Query already provides the
   rollback machinery — but it must come after (1), since optimism without
   conflict detection can show users state that never committed.
