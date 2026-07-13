# Project instructions for coding assistants

Document Approval Portal: React 19 + TypeScript (Vite) frontend in `web/`
against a **fixed** mock API in `mock-api/`.

## Hard rules

- Never modify `mock-api/db.json`, `mock-api/server.js`, the seed users, or
  the documented endpoints. They are a fixture; build only against the HTTP
  contract in `README.md`.
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

- Run before considering a change done:
  `npm run typecheck --prefix web && npm run lint --prefix web && npm test --prefix web`
- Tests: Vitest + Testing Library + MSW. Domain logic gets exhaustive unit
  tests; user flows get MSW-backed integration tests mounted through
  `web/src/test/utils.tsx` (real routes and providers).
- UI must stay usable at a 320px viewport; dense data gets a deliberate
  responsive treatment, not horizontal scroll.
- Decisions with product implications are documented in `DESIGN.md`; update
  it when an assumption changes.
