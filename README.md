# agent-render

`agent-render` is a fully static, zero-retention artifact viewer for AI-generated outputs.

`agent-render` focuses on fragment-based sharing for markdown, code, diffs, CSV, and JSON so the payload stays in the browser URL fragment instead of being sent to a server.

## Status

- Markdown, code, diff, CSV, and JSON all render in the static shell
- Fragment transport now supports `plain` and compressed `lz` codecs, with compression chosen automatically when it helps
- Markdown supports download plus browser print-to-PDF
- Deployment target: static hosting, including Cloudflare Pages

## Included Renderers

- `markdown` - GFM rendering with safe sanitization, download, print flow, and premium code fences that reuse the CodeMirror viewer stack
- `code` - read-only CodeMirror view with line numbers, wrap toggle, syntax-tree-aware rainbow brackets, and maintained indentation markers
- `diff` - review-style multi-file git patch viewer with unified and split modes
- `csv` - parsed table view with sticky headers and horizontal overflow handling
- `json` - lightweight read-only tree view plus raw code view, with graceful malformed JSON fallback

## Principles

- Fully static export with Next.js App Router
- No backend, no database, no server-side persistence
- Fragment-based payloads (`#...`) so the server never receives artifact contents
- Public-safe naming and MIT-compatible dependencies

## Local Development

```bash
npm install
npm run dev
```

## Local Preview

For the real export-only runtime story:

```bash
npm run build
npm run preview
```

Set `NEXT_PUBLIC_BASE_PATH` before `npm run build` when you want to preview a subpath deployment locally.

## Verification

```bash
npm run lint
npm run typecheck
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
```

The home page includes sample fragment presets for every artifact type, including a malformed JSON case for error handling.

The fragment examples are encoded with the same transport used by the app, so larger samples will naturally switch to compressed `lz` transport.

## Bundle Notes

The shell keeps first load lean and defers renderer-heavy code until needed. The remaining largest deferred dependency is the diff stack, which stays because it still delivers the strongest review-style unified/split UX for real git patches.

## Docs

- `docs/architecture.md` - architecture and tradeoffs
- `docs/payload-format.md` - fragment protocol, limits, and examples
- `docs/deployment.md` - deployment notes
- `docs/dependency-notes.md` - major dependency and license notes

## Zero Retention

The project keeps artifact contents in the URL fragment so the static host does not receive the payload during the page request. This improves privacy for shared artifacts, but the link still lives in browser history, copied URLs, and any client-side telemetry you add later.

`Zero Data Retention by design` means the deployed static host does not receive artifact contents as part of the request. It does not mean the data disappears from places like browser history, copied links, screenshots, or any client-side analytics you may add later.

## License

MIT
