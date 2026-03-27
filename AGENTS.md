# AGENTS.md

This file is the operating guide for contributors and coding agents working in `agent-render`.

Ground every change in the current shipped product, not speculative roadmap ideas.
If the code and this file diverge, trust the code first and update this file.

## Project identity

`agent-render` is a fully static, zero-retention artifact viewer for AI-generated outputs.

It is meant to make markdown, code, diffs, CSV, and JSON readable across chat surfaces that do a poor job rendering rich artifacts inline.

Core product traits right now:
- open source
- publicly hostable
- self-hostable
- static-export friendly
- fragment-based transport so artifact contents stay out of the request URL and off the server request path

## Product contract

Treat these as core constraints unless the owner explicitly changes the product direction.

- The app is a single exported client-side shell, not a backend product.
- Artifact payloads live in the URL fragment, using `#agent-render=v1.<codec>.<payload>` for `plain|lz|deflate`, and `#agent-render=v1.arx.<dictVersion>.<payload>` for `arx`.
- The deployed host should not receive artifact contents as part of the initial page request.
- Supported artifact kinds are `markdown`, `code`, `diff`, `csv`, and `json`.
- Supported codecs are `plain`, `lz`, `deflate`, and `arx`.
- The product is zero-retention by host design, not secret-safe in an absolute sense.
- Links may still leak through browser history, copied URLs, screenshots, and any future client-side analytics.

Do not casually introduce:
- server persistence
- databases
- auth requirements for the core viewing path
- request-body upload flows for the main sharing workflow
- normal query-param transport for artifact contents

## Current shipped behavior

Describe and preserve what is already true in the repo today.

### Shell and routing

- The app renders as one export-friendly shell.
- The empty state explains the product and exposes sample fragment presets.
- A built-in link creator can generate fragment-based links locally in the browser.
- When a valid fragment is present, the app switches to a viewer-first artifact layout.
- The artifact stage toolbar exposes copy-to-clipboard, file download, and (for markdown) browser print-to-PDF.
- `activeArtifactId` controls which artifact opens first.
- Internal diff file navigation stays in UI state and does not repurpose the fragment.

### Renderer behavior

- `markdown` renders as sanitized GFM and supports download plus browser print-to-PDF.
- Markdown code fences reuse the CodeMirror viewer approach instead of a second highlighting stack.
- Markdown ` ```mermaid ` fenced code blocks render as interactive diagrams via the dynamically imported `mermaid` library with theme-aware rendering and strict security.
- `code` uses a read-only CodeMirror surface with language-aware loading.
- `diff` uses a review-style git patch viewer with unified and split modes.
- `csv` renders as a readable table/grid.
- `json` renders as a lightweight structured tree plus raw fallback behavior.

### Performance and bundling

- Heavy renderers are dynamically imported so the initial shell stays lighter.
- The diff stack remains the heaviest deferred renderer and is kept because the UX is worth it.
- On-demand language loading is preferred over bundling every language path up front.

## Security and safety posture

Treat every payload as untrusted input.

Rules:
- keep artifact contents out of `dangerouslySetInnerHTML`
- do not enable raw HTML markdown rendering without explicit sanitization review
- preserve sanitization on the markdown path
- fail clearly on malformed or oversized payloads before renderer mount when possible
- do not market the product as magically private beyond the actual host-retention boundary

## Payload protocol

The fragment transport is part of the product surface, not an implementation detail.

Current rules:
- fragment key: `agent-render`
- format: `v1.<codec>.<payload>` for `plain|lz|deflate`, and `v1.arx.<dictVersion>.<payload>` for `arx`
- codecs: `plain`, `lz`, `deflate`, and `arx`
- fragment size budget: `8192` characters
- decoded payload budget: `200000` characters
- packed wire transport (`p: 1`) is allowed and must decode back to the standard envelope
- bundles must contain at least one artifact
- artifact ids must be unique within a bundle
- invalid `activeArtifactId` values normalize to the first artifact

Diff artifacts:
- prefer a real unified git patch in `patch`
- `oldContent` plus `newContent` is also supported
- `view` may be `unified` or `split`

If you change the payload contract, update the code, docs, examples, and the OpenClaw skill together.

## Key files

### App shell and UI
- `src/components/viewer-shell.tsx` - main shell, fragment-driven state, empty state, artifact-stage layout
- `src/components/viewer/artifact-selector.tsx` - bundle artifact switching UI
- `src/components/viewer/fragment-details-disclosure.tsx` - fragment inspector/status disclosure
- `src/components/home/link-creator.tsx` - browser-side link creation UX

### Renderers
- `src/components/renderers/markdown-renderer.tsx`
- `src/components/renderers/mermaid-block.tsx` - inline mermaid diagram renderer used within markdown fences
- `src/components/renderers/code-renderer.tsx`
- `src/components/renderers/diff-renderer.tsx`
- `src/components/renderers/csv-renderer.tsx`
- `src/components/renderers/json-renderer.tsx`

### Payload and protocol
- `src/lib/payload/schema.ts` - type surface, limits, fragment key, supported kinds/codecs
- `src/lib/payload/fragment.ts` - encode/decode logic and transport behavior
- `src/lib/payload/arx-codec.ts` - arx codec: domain dictionary + brotli + base76/base1k/baseBMP encoding
- `public/arx-dictionary.json` - shared substitution dictionary for the arx codec (served as a static endpoint)
- `public/arx-dictionary.json.br` - pre-compressed brotli variant of the dictionary
- `scripts/compress-dictionary.mjs` - minifies and brotli-compresses the dictionary file
- `src/lib/payload/envelope.ts` - bundle normalization and validation
- `src/lib/payload/link-creator.ts` - draft-to-link generation helpers
- `src/lib/payload/examples.ts` - sample envelopes and example fragments

### Diff handling
- `src/lib/diff/git-patch.ts` - patch parsing support for diff rendering

### Docs and external contract
- `README.md`
- `docs/architecture.md`
- `docs/payload-format.md`
- `docs/deployment.md`
- `docs/dependency-notes.md`
- `docs/testing.md`
- `skills/agent-render-linking/SKILL.md`

## Development commands

Install and run:

```bash
npm install
npm run dev
```

Export-style local preview:

```bash
npm run build
npm run preview
```

Subpath preview check:

```bash
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
npm run preview
```

Validation:

```bash
npm run lint
npm run test
npm run typecheck
npm run test:e2e
npm run test:ci
npm run check
```

First-time Playwright browser install:

```bash
npm run test:browsers
```

## Change discipline

When making changes, preserve the product shape unless the owner explicitly wants a direction change.

### Do
- keep the core experience static-host friendly
- add a preceding `/** ... */` block for public exported functions/components in `src/lib/**` and `src/components/**`
- keep the fragment transport client-side
- prefer small, explicit protocol changes
- update docs when changing user-visible behavior or protocol semantics
- keep examples representative of the real supported envelope format
- verify visual changes with Playwright when they affect layout or renderer presentation
- review dependency licenses before introducing anything with unclear terms

### Do not
- add backend requirements just to make sharing easier
- move artifact bodies into normal query params
- promise unsupported artifact kinds in docs or UI copy
- leave the skill contract stale when the app contract changes
- describe roadmap ideas in this file as if they already ship

## Docs that must stay aligned

If any of these change, check the rest in the same pass:
- fragment format
- supported artifact kinds
- payload size limits
- zero-retention wording
- renderer capabilities
- local commands
- deployment assumptions

At minimum, verify alignment across:
- `README.md`
- `docs/architecture.md`
- `docs/payload-format.md`
- `docs/deployment.md`
- `docs/dependency-notes.md`
- `docs/testing.md`
- `skills/agent-render-linking/SKILL.md`

## Default contributor stance

Be conservative with product claims and precise with protocol changes.

`agent-render` is useful because it is simple:
- static
- linkable
- open
- self-hostable
- readable across chat platforms

Protect that simplicity.