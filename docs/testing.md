# Testing

`agent-render` uses three layers of regression protection:

- `Vitest` for logic and integration tests around payload transport, diff parsing, and language inference
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

- browser tests protect exported-app behavior, fragment-driven rendering, downloads, clipboard copy, print flow, themes, and layout hierarchy
- visual tests protect empty state, artifact views, theme presentation, and compact-content spacing
- component tests protect selector/disclosure UI contracts
- unit tests protect transport codecs, envelope validation, diff parsing, and language inference

## CI

The repository includes `.github/workflows/test.yml`, which installs Playwright browsers and runs `npm run test:ci` on pushes, pull requests, and manual dispatch.
