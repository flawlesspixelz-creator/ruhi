# Project instructions for coding assistants

Document Approval Portal: React 19 + TypeScript (Vite) frontend in `web/`
against an Express + SQLite mock API in `mock-api/` (schema and seed in
`mock-api/db.js`).

## Hard rules

- The mock API is no longer a frozen fixture: the second phase replaced
  `db.json`/json-server with SQLite and rewrote `server.js`. It may be
  changed when a requirement calls for it, but preserve the seed users, the
  seed documents, and every documented endpoint path, and update the API
  contract table in `README.md` whenever behavior or payloads change.
- Approval decisions are sequential and server-authoritative: only the
  approver whose step is first-pending may approve or reject, and workflow
  endpoints take `actor` as a **user id**, not a display name.
- All permission logic goes through `web/src/domain/permissions.ts`. No
  component may decide role/status rules inline.
- All user-facing strings go through i18next; add every new key to **all
  three** locale files (`web/src/i18n/locales/{en,fi,sv}.json`).
- Keep business logic in `web/src/domain/` as pure functions (no React, no
  fetch); pages compose domain + hooks + shared components.
- Mutations must never auto-retry; reads may. Invalidate the documents list
  after every workflow mutation.
- Validation returns i18n keys, not display strings.

## Design guidance

When no explicit design instruction is given, follow the priority order of
the ui-ux-pro-max skill (github.com/nextlevelbuilder/ui-ux-pro-max-skill):
accessibility first (4.5:1 contrast, visible focus, labels), then touch
(44px targets, no tap delay), layout (mobile-first, no horizontal scroll,
4/8px spacing scale), typography (16px base, 1.5 line height, weight
hierarchy), and motion last (150–300ms, ease-out entrances, respect
prefers-reduced-motion). Use semantic color tokens, never raw hex in
components.

## Workflow

- Run before considering a change done (root scripts):
  `npm run typecheck && npm run lint && npm test`, plus `npm run smoke` when
  the mock API or its contract changed.
- Tests: Vitest + Testing Library + MSW. Domain logic gets exhaustive unit
  tests; user flows get MSW-backed integration tests mounted through
  `web/src/test/utils.tsx` (real routes and providers).
- UI must stay usable at a 320px viewport; dense data gets a deliberate
  responsive treatment, not horizontal scroll.
- Decisions with product implications are documented in `DESIGN.md`; update
  it when an assumption changes.
