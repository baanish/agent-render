# agent-render

`agent-render` is a fully static, zero-retention artifact viewer for AI-generated outputs.

Phase 1 focuses on fragment-based sharing for markdown, code, diffs, CSV, and JSON so the payload stays in the browser URL fragment instead of being sent to a server.

## Status

- Sprint 1 complete: markdown renderer, markdown download, and print-to-PDF flow
- Planned next renderers: code, diff, CSV, and JSON
- Deployment target: GitHub Pages by default, with support for other static hosts

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

## Docs

- `docs/architecture.md` - Phase 1 architecture and tradeoffs
- `docs/payload-format.md` - fragment protocol, limits, and examples
- `docs/deployment.md` - GitHub Pages deployment notes
- `docs/dependency-notes.md` - major dependency and license notes

## License

MIT
