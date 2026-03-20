# Testing

`agent-render` uses three layers of regression protection:

- `Vitest` for logic and integration tests around payload transport, self-hosted storage behavior, diff parsing, and language inference
- `Vitest` plus Testing Library for focused UI contract tests
- `Playwright` for exported-app browser flows and screenshot regression coverage

## Commands

```bash
npm run test
npm run test:watch
npm run test:e2e
npm run test:e2e:update
npm run test:browsers
npm run test:ci
npm run lint
npm run typecheck
npm run build
```

## Coverage focus

The suite is intentionally split by responsibility:

- browser tests protect exported-app behavior, fragment-driven rendering, downloads, clipboard copy, print flow, themes, and layout hierarchy
- visual tests protect empty state, artifact views, theme presentation, and compact-content spacing
- component tests protect selector/disclosure UI contracts and shared viewer-shell behavior
- unit/integration tests protect transport codecs, envelope validation, diff parsing, language inference, self-hosted CRUD, UUID lookup, expiry handling, TTL refresh, and server bootstrap injection

## Browser install

Before running Playwright locally for the first time:

```bash
npm run test:browsers
```

## Visual regression workflow

Playwright visual tests live in `tests/e2e/visual.spec.ts`.

- Run `npm run test:e2e` to compare against the current snapshots.
- Run `npm run test:e2e:update` only when a visual change is intentional and reviewed.
- Keep snapshots deterministic by using the exported preview flow, fixed viewport sizes, controlled themes, and animation suppression.

If you make a noticeable viewer/layout change, prefer validating it through Playwright when the environment supports browser execution.

## Self-hosted notes

The self-hosted server tests run in Node mode and cover:

- `POST /api/artifacts`
- `GET /api/artifacts/:id`
- `PUT /api/artifacts/:id`
- `DELETE /api/artifacts/:id`
- TTL refresh on successful read/view
- expired artifact handling
- HTML bootstrap injection for `/{uuid}` rendering

## CI

The repository includes `.github/workflows/test.yml`, which runs the core validation stack. In constrained environments, Playwright browser install or font/network-dependent build steps may still need operator judgment.
