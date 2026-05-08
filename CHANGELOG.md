# Changelog

All notable changes to `agent-render` will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic versioning while it is published as tagged releases.

## [0.1.0] - 2026-05-05

### Added

- Static, fragment-based artifact viewer for markdown, code, diffs, CSV, and JSON.
- Browser-local link creator for fragment payloads that stay out of the request path.
- Payload transport support for `plain`, `lz`, `deflate`, and `arx` codecs.
- Packed wire transport support for compact bundle links.
- ARX dictionary endpoint at `/arx-dictionary.json` with a precompressed `.br` variant.
- Markdown renderer with sanitized GFM, CodeMirror-backed code fences, and Mermaid diagram support.
- Read-only CodeMirror code renderer with language-aware loading.
- Review-style git patch renderer with unified and split diff modes.
- CSV table renderer and JSON tree/raw fallback renderer.
- Copy, download, and markdown print-to-PDF actions from the viewer shell.
- Optional self-hosted UUID mode with SQLite persistence, TTL refresh, Docker, and daemon deployment docs.
- Playwright visual snapshots and unit/e2e validation commands for release checks.

### Security

- Documented the zero-retention boundary for static fragment links.
- Preserved the warning that links can still leak through browser history, copied URLs, screenshots, and future client-side analytics.
- Added `SECURITY.md` with vulnerability reporting guidance and supported-version policy.

### Manual GitHub Release Checklist

- Set the repository description to: `Static, zero-retention artifact viewer for markdown, code, diffs, CSV, and JSON.`
- Set the repository website to: `https://agent-render.com`
- Add repository topics: `artifact-viewer`, `markdown`, `diff`, `static-site`, `zero-retention`, `openclaw`, `nextjs`.
- Create the first GitHub release for tag `v0.1.0` using the notes above.
