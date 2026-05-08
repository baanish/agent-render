# Architecture

## Project shape

`agent-render` is a single exported client-side shell built with Next.js 15, React 19, and Tailwind CSS 4.

- The application ships as static files only.
- All artifact data lives in the URL fragment.
- The app renders one viewer shell and selects a renderer based on the artifact kind.
- Renderers stay modular so they can evolve independently without coupling to Next.js routing.

## Why a single exported route

GitHub Pages is strongest when the application behaves like a static shell instead of a path-heavy routed app.

- Avoids subpath and refresh traps on project pages
- Keeps payload handling entirely client-side
- Makes deployment portable to any static host

The static export also emits `sitemap.xml` at the site root (and under `NEXT_PUBLIC_BASE_PATH` when set). Set `NEXT_PUBLIC_SITE_URL` at build time so the sitemap and metadata use your real canonical origin.

## Renderer implementation

- `markdown` - formatted document view with shell copy, download, and print-to-PDF flows plus embedded premium code fences and inline mermaid diagram rendering
- `code` - read-only CodeMirror view with syntax-aware rendering and code affordances
- `diff` - review-style diff view with unified and split modes
- `csv` - table-focused data grid built from parsed rows and dynamic columns
- `json` - lightweight read-only tree view plus a raw CodeMirror view

The viewer shell now routes all five artifact kinds through dynamically imported client-only renderers so the landing shell stays light and static-host friendly.

When a valid fragment is present, the shell switches into a viewer-first layout with bundle navigation beside the active artifact. The active artifact header includes copy, download, and markdown print actions. The landing/samples experience is only the empty state.

Diff file navigation is intentionally internal UI state now. The URL fragment remains reserved for payload transport and active-artifact selection instead of being reused as an in-page file anchor system.

## Markdown fence choice

This round explicitly evaluated Shiki and rejected it for now.

- Shiki is MIT and technically viable in a fully static app.
- The current app already ships a premium read-only CodeMirror stack for source viewing.
- Reusing that stack for markdown fences keeps them visually strong while avoiding a second async highlighting system and an additional code/theme/language runtime.
- That choice also removes the weaker `rehype-highlight` plus `highlight.js` path instead of carrying both.

If markdown fence fidelity becomes a repeated product problem after these bundle reductions, Shiki remains the next serious candidate, but it should replace rather than supplement the current fence path.

## Mermaid diagram support

Markdown artifacts render ` ```mermaid ` fenced code blocks as interactive diagrams using the `mermaid` library. The library is dynamically imported on first encounter to avoid bloating the initial bundle. Diagrams respond to theme changes (light/dark) and fall back to displaying the raw mermaid source if rendering fails. Security level is set to `strict` to prevent script injection via diagram definitions.

## Raw code renderer choice

The raw code viewer now keeps CodeMirror, but the architecture is cleaner:

- language modules load on demand instead of being statically imported together
- indentation guides come from the maintained `@replit/codemirror-indentation-markers` extension
- rainbow brackets stay custom, but now operate as a syntax-tree-aware decoration pass instead of naive quote tracking

That keeps the viewer static-hosting friendly while removing the brittle parts of the earlier implementation.

## Bundle tradeoffs

The largest remaining deferred cost is still the diff renderer stack, primarily `@git-diff-view/*` and its highlighting internals. It remains because it still provides the best review-style UX for multi-file git patches, split/unified modes, and syntax-aware rendering with less product code than a bespoke replacement.

The JSON and markdown paths are now substantially lighter because:

- `vanilla-jsoneditor` was removed in favor of a lighter read-only tree view
- `rehype-highlight` and its Highlight.js stack were removed
- CodeMirror language support now loads on demand per active language

## Diff choice

`agent-render` uses `@git-diff-view/react` plus git-diff `DiffFile` instances instead of `@codemirror/merge`.

- `@git-diff-view/*` matches the product goal better because it is already shaped like a GitHub-style review surface
- split and unified views are built in
- syntax highlighting and diff affordances are stronger out of the box for artifact viewing
- individual file patches can be rendered as a sequence while preserving filenames and boundaries
- CodeMirror remains the better fit for raw source and raw JSON views

`@codemirror/merge` stays a reasonable future option if the project ever needs a more editor-centric comparison workflow, but it is not the best default for shareable review artifacts.

## Security posture

- Treat every payload as untrusted input
- Disable raw HTML in markdown by default
- Keep artifact text out of `dangerouslySetInnerHTML`
- Sanitize any content pipeline that can introduce markup

## Transport

The fragment protocol keeps the JSON envelope stable and treats compression strictly as transport.

- `plain` stores base64url-encoded JSON for compatibility and debugging
- `lz` stores compressed JSON via `lz-string` when it produces a smaller fragment
- `deflate` stores deflate-compressed UTF-8 JSON bytes when it outperforms other codecs
- `arx` applies domain-dictionary substitution, brotli compression (quality 11), and binary-to-text encoding for best-in-class compression. Four wire shapes are candidates: base76 (ASCII, 77 fragment-safe chars), base64url (RFC 4648 `A-Za-z0-9-_` with a `B.` prefix for detection), base1k (Unicode, 1774 chars from U+00A1–U+07FF), and baseBMP (high-density Unicode, ~62k safe BMP code points from U+00A1–U+FFEF, ~15.92 bits/char). The async encoder tries all four and picks the shortest **transport** length (percent-encoded UTF-8 length for non-ASCII), so base64url can win over Unicode encodings on chat-style surfaces. baseBMP produces ~32% fewer characters than base1k and ~55% fewer than base76 for the same compressed bytes, achieving ~70% smaller fragments than deflate on typical payloads (~6.1x compression ratio for 8k markdown). Full pipeline timing is on the order of ~8–14ms for 8k payloads depending on the wire encoding. The substitution dictionary is served as a static file at `/arx-dictionary.json` so agents can fetch it for local compression; a pre-compressed `/arx-dictionary.json.br` variant is also available. The viewer loads the dictionary on startup and falls back to a built-in table if the fetch fails.
- `arx2` keeps the arx compression stack but replaces the JSON envelope with a compact tuple envelope and applies `/arx2-dictionary.json` as an overlay before the shared arx dictionary. It uses `v1.arx2.<dictVersion>.<payload>` and decodes back to the standard envelope before validation/rendering.
- packed wire mode (`p: 1`) shortens transport keys before compression, then unpacks back to the standard envelope during decode
- automatic async codec selection tries `arx2 -> arx -> deflate -> lz -> plain`; arx compares packed + non-packed candidates, while arx2 uses its tuple envelope
- sync codec selection (used by examples and legacy paths) tries `deflate -> lz -> plain`
- decode enforces both fragment length and decoded payload size ceilings before UI rendering; arx/arx2 Brotli decompression uses a streaming output cap before final JSON or tuple parsing
- invalid bundle state is normalized or rejected before renderers mount

## Zero-retention boundaries

The static host does not receive fragment contents as part of the request, but that is not absolute secrecy.

- artifact data still exists in copied links
- artifact data can remain in browser history
- client-side analytics would still be able to observe decoded payloads if added later
- very large artifacts can exceed practical URL-sharing limits, which is why the shell enforces a fragment budget

## Routing and hosting constraints

- `output: "export"`
- GitHub Pages-compatible `basePath` and `assetPrefix`
- `.nojekyll` included for Pages compatibility
- Fragment size budget enforced before render

## Self-hosted UUID mode (optional)

The repository includes an optional self-hosted server mode in `selfhosted/` that provides UUID-based artifact links backed by SQLite. This is a separate deployment mode — the static export remains the default product.

### How it works

The self-hosted server is a standalone Node.js HTTP server that:

1. Serves the pre-built `out/` static files (the same frontend as the static product)
2. Exposes a REST API at `/api/artifacts` for CRUD operations on stored payloads
3. Handles `GET /:uuid` requests by looking up the payload in SQLite, injecting it into the viewer page via `window.__AGENT_RENDER_PAYLOAD__`, and serving the result

The `ViewerShell` component checks for `window.__AGENT_RENDER_PAYLOAD__` on mount. When present, it uses the injected payload string instead of reading `window.location.hash`. This feeds into the same decode → normalize → render pipeline, so all viewer features (copy, download, print-to-PDF, diff modes, artifact switching) work identically.

### Storage

SQLite with a single `artifacts` table:

- `id` (UUID v4 primary key)
- `payload` (the agent-render payload string)
- `created_at`, `updated_at`, `last_viewed_at` (ISO timestamps)
- `expires_at` (sliding TTL, refreshed on each successful read)

### TTL

Artifacts use a 24-hour sliding TTL. Each successful read (API or viewer) extends `expires_at` by 24 hours. Expired entries are lazily deleted on read and can also be batch-cleaned via `POST /api/cleanup`.

### Separation from static mode

The self-hosted mode does not alter the static export pipeline:

- `next.config.ts` remains `output: "export"`
- The frontend change is a single mount-time check for an injected payload — a no-op in static/fragment mode
- All existing fragment-based functionality, tests, and deployments are unaffected
- Self-hosted code lives entirely in `selfhosted/` and is not bundled into the static export

### Key files

- `selfhosted/server.ts` — HTTP server with API routes and UUID page rendering
- `selfhosted/db.ts` — SQLite persistence (CRUD, TTL refresh, cleanup)
- `selfhosted/ttl.ts` — TTL constants and helpers
- `selfhosted/validate.ts` — Payload validation for the API
- `selfhosted/Dockerfile` — Multi-stage Docker build
- `selfhosted/docker-compose.yml` — Docker Compose deployment
- `selfhosted/tsconfig.json` — TypeScript config for server-side compilation
