# Testing

`agent-render` uses three layers of regression protection:

- `Vitest` for logic and integration tests around payload transport, diff parsing, and language inference
- `Vitest` plus Testing Library for focused UI contract tests
- `Playwright` for exported-app browser flows and screenshot regression coverage

## Commands

```bash
npm run test
npm run test:watch
npm run assets:compress
npm run bench:codecs
npm run bench:codecs:update
npm run check:build-budgets
npm run test:e2e
npm run test:e2e:update
npm run test:browsers
npm run test:ci
```

## Browser install

Before running Playwright locally for the first time:

```bash
npm run test:browsers
```

This installs Chromium for the regression suite.

## Visual regression workflow

Playwright visual tests live in `tests/e2e/visual.spec.ts`.

- Run `npm run test:e2e` to compare against the current snapshots.
- Run `npm run test:e2e:update` only when a visual change is intentional and reviewed.
- Keep snapshots deterministic by using the exported preview flow, fixed viewport sizes, controlled themes, and animation suppression.

## Coverage focus

The suite is intentionally split by responsibility:

- browser tests protect exported-app behavior, fragment-driven rendering, downloads, clipboard copy, print flow, themes, and layout hierarchy (including mobile toolbar and default code-wrap checks in `tests/e2e/viewer.spec.ts`)
- visual tests protect empty state, artifact views, theme presentation, and compact-content spacing
- component tests protect selector/disclosure UI contracts
- unit tests protect transport codecs, envelope validation, diff parsing, and language inference
- `npm run assets:compress` regenerates minified/precompressed public assets, including the ARX dictionaries and mirrored diff-view stylesheet
- `npm run bench:codecs` protects arx/arx2 compressed-byte ratios and arx3 visible-character wins against the committed `scripts/bench-baseline.json`; its corpus is fixed in `scripts/bench-codecs.mjs` so unrelated source, docs, or package metadata edits do not create false codec regressions
- `npm run check:build-budgets` reads the generated `.next` manifests after `npm run build` and fails if the homepage shell or key deferred renderer chunks exceed their gzip budgets

## Self-hosted mode tests

The self-hosted server has its own test suite under `tests/selfhosted/`:

- `db.test.ts` — CRUD operations, TTL refresh, expiry cleanup
- `validate.test.ts` — Payload validation rules
- `ttl.test.ts` — TTL computation and expiry checks

These tests use `// @vitest-environment node` to run with Node.js instead of jsdom, since they depend on `better-sqlite3` (a native module).

They run as part of the standard `npm run test` command.

## CI

The repository includes `.github/workflows/test.yml`, which installs Playwright browsers and runs `npm run test:ci` on pushes, pull requests, and manual dispatch. That CI command includes the exported-app browser suite and the generated build-budget check.
