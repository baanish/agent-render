# agent-render

`agent-render` is a fully static, zero-retention artifact viewer for AI-generated outputs.

Phase 1 focuses on fragment-based sharing for markdown, code, diffs, CSV, and JSON so the payload stays in the browser URL fragment instead of being sent to a server.

## Status

- Phase 1 viewer complete: markdown, code, diff, CSV, and JSON all render in the static shell
- Fragment transport now supports `plain` and compressed `lz` codecs, with compression chosen automatically when it helps
- Markdown supports download plus browser print-to-PDF
- Deployment target: GitHub Pages by default, with support for other static hosts

## Included Renderers

- `markdown` - GFM rendering with safe sanitization, download, and print flow
- `code` - read-only CodeMirror view with line numbers, wrap toggle, rainbow brackets, and indent guides
- `diff` - review-style multi-file git patch viewer with unified and split modes
- `csv` - parsed table view with sticky headers and horizontal overflow handling
- `json` - read-only tree view plus raw code view, with graceful malformed JSON fallback

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

Set `NEXT_PUBLIC_BASE_PATH` before `npm run build` when you want to preview a project-pages style subpath export.

## Verification

```bash
npm run lint
npm run typecheck
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
```

The home page includes sample fragment presets for every artifact type, including a malformed JSON case for error handling.

The fragment examples are encoded with the same transport used by the app, so larger samples will naturally switch to compressed `lz` transport.

## Docs

- `docs/architecture.md` - Phase 1 architecture and tradeoffs
- `docs/payload-format.md` - fragment protocol, limits, and examples
- `docs/deployment.md` - GitHub Pages deployment notes
- `docs/dependency-notes.md` - major dependency and license notes

## Zero Retention

Phase 1 keeps artifact contents in the URL fragment so the static host does not receive the payload during the page request. This improves privacy for shared artifacts, but the link still lives in browser history, copied URLs, and any client-side telemetry you add later.

## License

MIT
