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

This installs Chromium and WebKit for the exported-app regression suite.

## Visual regression workflow

Playwright visual tests live in `tests/e2e/visual.spec.ts`.

- Run `npm run test:e2e` to compare against the current snapshots.
- Run `npm run test:e2e:update` only when a visual change is intentional and reviewed.
- Keep snapshots deterministic by using the exported preview flow, fixed viewport sizes, controlled themes, and animation suppression.

## Coverage focus

The suite is intentionally split by responsibility:

- browser tests protect exported-app behavior, fragment-driven rendering, downloads, clipboard copy, print flow, in-viewer edit-and-reshare, themes, and layout hierarchy (including mobile toolbar and default code-wrap checks in `tests/e2e/viewer.spec.ts`)
- visual tests protect empty state, artifact views, theme presentation, and compact-content spacing
- component tests protect selector/disclosure UI contracts
- unit tests protect transport codecs, envelope validation, diff parsing, and language inference
- `npm run assets:compress` regenerates the minified and precompressed ARX dictionary assets
- `npm run bench:codecs` protects arx/arx2 compressed-byte ratios and the historical arx3 visible-character row against the committed `scripts/bench-baseline.json`; its corpus is fixed in `scripts/bench-codecs.mjs` so unrelated source, docs, or package metadata edits do not create false codec regressions. Auto-emit no longer uses the arx3 visible-length policy.
- `npm run check:build-budgets` reads the generated `.next` manifests after `npm run build` and fails if the homepage shell or key deferred renderer chunks exceed their gzip budgets

## ARX6 verification and measurement

ARX6 has separate compatibility, correctness, and measurement checks:

- `tests/arx6-codec.test.ts` pins original ARX6 decode vectors and v2 encode vectors, exact body/metadata round trips, diff reconstruction, canonical fraction handling, WTF-8 boundaries, and checksum corruption detection.
- `tests/arx6-adversarial.test.ts` checks immutable prior installation, exact UTF-16 boundaries across artifacts, normal schema/active-artifact handling, and reconstructed-envelope size limits even when a malicious sender supplies a valid checksum.
- `tests/arx6-selection.test.ts` protects the complete old candidate pool and strict replacement rule. A fitting ARX6 candidate must not suppress an ARX5 win, and a tie must keep the old wire byte for byte.
- `tests/e2e/arx6-determinism.spec.ts` compares Node and browser v2 output for every prior id, tests exact UTF-16 preservation, and checks truncated-link rejection. Browser coverage includes Chromium and WebKit.
- `tests/arx-radix-equivalence.test.ts` checks the optimized legacy radix encoders against the old integer algorithms and committed wire goldens, including byte-width boundaries, leading zeros, and large inputs.
- `tests/arx6-core.test.ts` runs the separately frozen PR #117 experimental core's conformance checks. Passing them does not register its `#g1L` wire in the viewer.
- `tests/browser-codec.test.ts` protects Worker serialization, queue limits, cancellation, deadlines, failures, and idle termination. `tests/e2e/payload-worker.spec.ts` exercises real Worker encoding/decoding, browser responsiveness, and subpath asset loading in both engines.

Run the normal unit, lint, typecheck, build, and exported-app browser checks after a wire or model change. Worker lifecycle tests cover serial execution, queue bounds, abort, deadline, failure, and idle shutdown; browser checks must also exercise the real bundled Worker and base-path asset loading. Never update a frozen legacy golden merely to make a changed model pass.

The historical `bench:codecs` gate does not measure ARX6 or justify new compression claims. The [ARX6 benchmark instructions](../experiments/arx6/README.md) describe exact-revision comparisons, complete serialized URL/Markdown lengths, normalized lossless round trips, latency, memory, and corpus provenance. The [research report](arx6-research.md) separates current results from the original PR measurements. Development diagnostics and generated validation cases are not independent real-agent traffic. Keep model decisions frozen before opening validation data, and collect an independently sourced corpus before claiming a population-wide saving.

A browser URL round trip does not establish live Discord or WhatsApp behavior. Verify real paste/click flows separately when qualifying a release for those clients; do not infer chat safety from Unicode glyph counts.

## Self-hosted mode tests

The self-hosted server has its own test suite under `tests/selfhosted/`:

- `db.test.ts` — CRUD operations, TTL refresh, expiry cleanup
- `validate.test.ts` — Payload validation rules
- `ttl.test.ts` — TTL computation and expiry checks
- `api-catalog.test.ts` — RFC 9727 `/.well-known/api-catalog` discovery headers over a spawned export server
- `static-headers.test.ts` — precompressed `.br` static-asset header contract (Content-Type/Content-Encoding/Vary, immutable `_next` caching)

Most of these tests use `// @vitest-environment node` to run with Node.js instead of jsdom, since the SQLite-backed tests depend on `better-sqlite3` (a native module); `api-catalog.test.ts` instead runs in the default environment and exercises the self-hosted export server in a spawned child process.

They run as part of the standard `npm run test` command.

After building, `npm run selfhosted:csp-smoke` drives the actual self-hosted server in Chromium. It checks static routes and renderer behavior, then generates and previews ARX6 and ARX2 links through the bundled Worker (including real Brotli WASM), failing on CSP violations.

## CI

The repository includes `.github/workflows/test.yml`, which installs Playwright browsers and runs `npm run test:ci` on pushes, pull requests, and manual dispatch. That CI command includes the exported-app browser suite and the generated build-budget check.
