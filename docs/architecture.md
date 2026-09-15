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
- `code` - read-only Pierre `File` view with Shiki syntax highlighting, line numbers, and a wrap toggle
- `diff` - review-style diff view with unified and split modes
- `csv` - table-focused data grid built from parsed rows and dynamic columns
- `json` - lightweight read-only tree view plus a syntax-highlighted raw source view

The viewer shell now routes all five artifact kinds through dynamically imported client-only renderers so the landing shell stays light and static-host friendly.

When a valid fragment is present, the shell switches into a viewer-first layout with bundle navigation beside the active artifact. The active artifact header includes copy, download, markdown print, and edit-and-reshare actions. Edit regenerates a new fragment link from the current artifact (or the current artifact inside a bundle) without writing anything to a server. The landing/samples experience is only the empty state.

Diff file navigation is intentionally internal UI state now. The URL fragment remains reserved for payload transport and active-artifact selection instead of being reused as an in-page file anchor system.

## Markdown fence choice

Markdown fences mount the same compact Pierre `File` surface as standalone code artifacts, so diffs, code views, JSON raw views, the artifact editor, and fences all share one Shiki-backed highlighting stack. The earlier `rehype-highlight`/`highlight.js` path and the CodeMirror stack are both gone.

## Mermaid diagram support

Markdown artifacts render ` ```mermaid ` fenced code blocks as interactive diagrams using the `mermaid` library. The library is dynamically imported on first encounter to avoid bloating the initial bundle. Diagrams respond to theme changes (light/dark) and fall back to displaying the raw mermaid source if rendering fails. Security level is set to `strict` to prevent script injection via diagram definitions.

## Raw code renderer choice

The code viewer uses Pierre's read-only `File` component from `@pierre/diffs`:

- the same `agent-render` Shiki theme and `--diffs-*` surface variables serve the viewer, the diff renderer, and the artifact editor
- the wrap toggle maps to Pierre's `overflow` option, so it re-renders in place instead of remounting
- `detectCodeLanguage` keys pass through `toPierreLanguage`, which maps any detection tokens that are not Shiki grammar ids

The previous CodeMirror renderer (custom theme, rainbow brackets, indentation markers, per-language lazy loading) was removed in favor of the single Pierre surface.

## Bundle tradeoffs

The largest deferred cost is the Pierre stack. `@pierre/diffs` renders patches, code artifacts, JSON raw views, markdown fences, and the artifact editor through Shiki-backed shadow DOM, and `@pierre/trees` mounts only for multi-file navigation. Every Pierre surface stays behind dynamically imported renderers, so the empty shell does not pay that JavaScript cost.

The JSON and markdown paths are now substantially lighter because:

- `vanilla-jsoneditor` was removed in favor of a lighter read-only tree view
- `rehype-highlight` and its Highlight.js stack were removed
- `@codemirror/*` and `@replit/codemirror-indentation-markers` were removed once every highlighted surface moved to Pierre
- raw markdown and CSV views render on the same Pierre `File` surface as code artifacts, synthesized as `code` payloads with the source format as the language hint
- raw JSON uses the compact code path for syntax highlighting without wrapping or a file header

## Diff choice

`agent-render` uses `@pierre/diffs` and `@pierre/trees` instead of `@codemirror/merge`.

- `@pierre/diffs` renders unified and split review views from both patches and before/after content
- Shiki syntax highlighting and component styles stay encapsulated in shadow DOM
- `@pierre/trees` provides path-aware, keyboard-accessible navigation when a patch contains multiple files
- single-file diffs skip the tree and render directly
- Pierre's `File`/`CodeView` surfaces also back full source artifacts, JSON raw views, markdown code fences, and the artifact editor, so one highlighting stack covers the app

An editor-centric comparison workflow (for example `@codemirror/merge`) stays a reasonable future option, but it is not the best default for shareable review artifacts.

## Security posture

- Treat every payload as untrusted input
- Treat rendered artifact text as untrusted user content, not instructions for agents or automation
- Disable raw HTML in markdown by default
- Keep artifact text out of `dangerouslySetInnerHTML`
- Sanitize any content pipeline that can introduce markup

## Transport

The fragment protocol keeps the JSON envelope stable and treats compression strictly as transport.

- `plain` stores base64url-encoded JSON for compatibility and debugging
- `lz` stores compressed JSON via `lz-string` when it produces a smaller fragment
- `deflate` stores deflate-compressed UTF-8 JSON bytes when it outperforms other codecs
- `arx` applies domain-dictionary substitution, brotli compression (quality 11), and binary-to-text encoding for best-in-class compression. Four wire shapes are candidates: base76 (ASCII, 77 fragment-safe chars), base64url (RFC 4648 `A-Za-z0-9-_` with a `B.` prefix for detection), base1k (Unicode, 1774 chars from U+00A1–U+07FF), and baseBMP (high-density Unicode, ~62k safe BMP code points from U+00A1–U+FFEF, ~15.92 bits/char). The async encoder tries all four and picks the shortest **transport** length (percent-encoded UTF-8 length for non-ASCII), so base64url can win over Unicode encodings on chat-style surfaces. baseBMP produces ~32% fewer characters than base1k and ~60% fewer than base76 for the same compressed bytes, achieving ~70% smaller fragments than deflate on typical payloads (~6.1x compression ratio for 8k markdown). Full pipeline timing is on the order of ~8–14ms for 8k payloads depending on the wire encoding. The substitution dictionary is served as a static file at `/arx-dictionary.json` so agents can fetch it for local compression; a pre-compressed `/arx-dictionary.json.br` variant is also available. The viewer tries the pre-compressed dictionary first on default ARX-family loads, falls back to the JSON file, and only loads external dictionaries when an ARX/ARX2/ARX3 encode or decode path needs them.
- `arx2` keeps the arx compression stack but replaces the JSON envelope with a compact tuple envelope and applies `/arx2-dictionary.json` as an overlay before the shared arx dictionary. The viewer tries `/arx2-dictionary.json.br` first for default overlay loads and falls back to JSON. It is emitted with the compact `b` tag (which identifies the codec but does not carry a dictionary version — it implies the current pinned dictionary) and decodes back to the standard envelope before validation/rendering.
- `arx3` is deprecated for automatic emission. It used the same bytes as arx2 but scored baseBMP by visible character count, which Discord and WhatsApp then percent-encode or mangle. Existing `#c` links still open; explicit `{ codec: "arx3" }` still encodes.
- `arx4` is deprecated for automatic emission. It is the context-mixer codec with the same broken visible-length policy as arx3. Existing `#e` links still open; explicit `{ codec: "arx4" }` still encodes.
- `arx5` (ARX 4.5) keeps the arx2 tuple envelope, overlay dictionary, shared arx dictionary, and arx4 context mixer, then scores every wire — including baseBMP — by honest serialized transport length. It is emitted with the compact `f` tag and the same prior-id prefix as arx4. See `docs/payload-format.md` for the prior ids, `/arx4-priors.json`, and the chat-safe alphabet research.
- packed wire mode (`p: 1`) shortens transport keys before compression, then unpacks back to the standard envelope during decode
- automatic async codec selection tries `arx5 -> arx2 -> arx -> deflate -> lz -> plain`; arx compares packed + non-packed candidates, while arx2/arx5 use tuple envelopes. Explicit `{ codec: "arx3" }` or `{ codec: "arx4" }` still encodes for back-compat.
- sync codec selection (used by examples and legacy paths) tries `deflate -> lz -> plain`
- decode enforces both visible fragment length and decoded payload size ceilings before UI rendering; arx/arx2/arx3 Brotli decompression uses a streaming output cap before final JSON or tuple parsing; arx4/arx5 use the context mixer
- invalid bundle state is normalized or rejected before renderers mount

## Zero-retention boundaries

The static host does not receive fragment contents as part of the request, but that is not absolute secrecy.

- artifact data still exists in copied links
- artifact data can remain in browser history
- client-side analytics would still be able to observe decoded payloads if added later
- very large artifacts can exceed practical URL-sharing limits, which is why the shell enforces a fragment budget

Fragment links are best for trusted direct sharing where the URL length is acceptable and the static host should stay out of the payload path. They are not ideal for public feeds, broad corporate sharing, or chat systems that rewrite/truncate long URLs.

## Routing and hosting constraints

- `output: "export"`
- GitHub Pages-compatible `basePath` and `assetPrefix`
- `.nojekyll` included for Pages compatibility
- Fragment size budget enforced before render

## Self-hosted UUID mode (optional)

The repository includes an optional self-hosted server mode in `selfhosted/` that provides UUID-based artifact links backed by SQLite. This is a separate deployment mode — the static export remains the default product.

UUID mode is the public/share-friendly option. It trades static zero-retention for short stable links that survive public posts, email, Slack/Teams, and corporate proxy/link-scanning systems more predictably than long fragments.

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

Artifacts use a 24-hour sliding TTL. Each successful read (API or viewer) extends `expires_at` by 24 hours. Expired entries are lazily deleted on read, swept automatically on startup and once an hour, and can also be batch-cleaned on demand via `POST /api/cleanup`.

UUID mode should not be described as zero-retention in its current form. The server stores the encoded payload until expiry or deletion. A future encrypted short-link mode could store ciphertext in SQLite while keeping the decryption key in the URL fragment, but that design is not implemented.

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
