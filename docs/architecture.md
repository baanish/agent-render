# Architecture

## Project shape

`agent-render` now ships in two closely related modes:

1. **Static fragment mode** - the main/default product, exported as static files.
2. **Self-hosted UUID mode** - an optional server-backed add-on that reuses the same viewer UI.

The static mode remains the core product identity. The self-hosted mode exists for operators who want practical UUID links, local/private deployments, or relief from fragment-length and chat-surface transport issues.

## Static fragment mode

The default app remains a single exported client-side shell built with Next.js 15, React 19, and Tailwind CSS 4.

- All artifact data lives in the URL fragment.
- The app renders one viewer shell and selects a renderer based on the artifact kind.
- Renderers stay modular so they can evolve independently without coupling to route-specific server logic.
- The deployed static host does not receive artifact contents on the initial request.

### Why a single exported route

GitHub Pages and similar hosts are strongest when the application behaves like a static shell instead of a path-heavy routed app.

- avoids subpath and refresh traps on project pages
- keeps payload handling entirely client-side
- makes deployment portable to any static host

## Optional self-hosted UUID mode

Self-hosted mode adds a small Node.js server and SQLite database without replacing the static app.

### Responsibilities

- store the existing `agent-render` payload string as-is under a UUID v4
- serve `GET /{uuid}` links that reuse the same viewer shell and renderers
- expose a simple CRUD-style API for create/read/delete and optional update
- enforce a 24-hour sliding TTL

### Why it exists

This mode is useful when:

- fragment links are too large for a target surface
- users want a same-machine or private deployment near their agent runtime
- operators prefer short UUID URLs for temporary artifacts
- payloads should survive chat-link mangling without introducing a second artifact schema

### Server composition

The optional server:

- serves the exported static viewer assets from `out/`
- stores `id -> payload_string` in SQLite
- injects a bootstrap payload into the exported HTML for `/{uuid}` routes
- reuses the shipped client-side decode/render flow rather than inventing a second viewer

The browser still decodes the same payload string format; the only difference is how the string gets delivered to the page.

## Viewer reuse

The shared viewer shell remains the main frontend surface.

- fragment mode reads `window.location.hash`
- self-hosted mode reads an injected bootstrap payload when present
- both modes use the same payload decoder, envelope normalization, artifact selector, renderer toolbar, and renderer components

Artifact switching differs slightly by mode:

- fragment mode updates `activeArtifactId` in the fragment so the link remains truthful
- self-hosted mode keeps artifact switching in local UI state so the UUID route and stored payload string stay stable

Other viewer features stay aligned across both modes:

- copy to clipboard
- file download
- markdown print-to-PDF
- diff unified/split modes
- bundle artifact switching

## Renderer implementation

- `markdown` - formatted document view with shell copy, download, and print-to-PDF flows plus embedded premium code fences
- `code` - read-only CodeMirror view with syntax-aware rendering and code affordances
- `diff` - review-style diff view with unified and split modes
- `csv` - table-focused data grid built from parsed rows and dynamic columns
- `json` - lightweight read-only tree view plus a raw CodeMirror view

The viewer shell routes all five artifact kinds through dynamically imported client-only renderers so the landing shell stays light.

## Storage model

SQLite schema is intentionally minimal:

- `id TEXT PRIMARY KEY`
- `payload TEXT NOT NULL`
- `created_at`
- `updated_at`
- `last_viewed_at`
- `expires_at`

Indexes exist on `expires_at` and `last_viewed_at` because expiry and refresh are the main operational queries.

The stored `payload` value is the existing fragment payload body, such as:

```text
agent-render=v1.deflate.<payload>
```

No second artifact schema is introduced.

## TTL behavior

Self-hosted mode uses a **24-hour sliding TTL**.

- successful `GET /api/artifacts/:id` refreshes expiry
- successful `GET /:id` refreshes expiry
- expired rows fail clearly
- expired rows are deleted lazily on access
- `npm run cleanup:selfhosted` provides manual/agent-triggered cleanup

Docs recommend that deployments with perimeter auth treat TTL refresh as happening on successful authenticated access. The server itself stays auth-neutral.

## Security posture

### Shared rules

- treat every payload as untrusted input
- keep artifact text out of `dangerouslySetInnerHTML`
- preserve markdown sanitization
- fail clearly on malformed payloads before renderer mount when possible

### Static mode

- zero-retention by host design
- fragment contents do not reach the initial server request path

### Self-hosted mode

- intentionally server-backed
- SQLite retention is time-limited, not zero-retention
- auth is optional and left to deployment perimeter choices
- Cloudflare Tunnel / Zero Trust, reverse proxy auth, or local-only binding are all valid practical patterns

## Transport

The fragment protocol remains the canonical payload format across both modes.

- `plain` stores base64url-encoded JSON for compatibility and debugging
- `lz` stores compressed JSON via `lz-string` when it produces a smaller fragment
- `deflate` stores deflate-compressed UTF-8 JSON bytes when it outperforms other codecs
- `arx` applies domain-dictionary substitution, brotli compression, and binary-to-text encoding for best-in-class compression
- packed wire mode (`p: 1`) shortens keys before compression and expands back to the standard envelope during decode

Self-hosted mode stores that same encoded payload string instead of changing the envelope contract.

## Routing and hosting constraints

### Static mode

- `output: "export"`
- GitHub Pages-compatible `basePath` and `assetPrefix`
- fragment size budget enforced before render

### Self-hosted mode

- requires a Node.js runtime
- reuses the exported viewer assets generated by `npm run build`
- keeps route surface intentionally small: `/`, `/{uuid}`, and `/api/artifacts/*`
