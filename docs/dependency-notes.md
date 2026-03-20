# Dependency Notes

## Current selections

- `next` - MIT
- `react` / `react-dom` - MIT
- `tailwindcss` / `@tailwindcss/postcss` - MIT
- `react-markdown` - MIT
- `remark-gfm` - MIT
- `rehype-sanitize` - MIT
- `@codemirror/*` - MIT
- `@replit/codemirror-indentation-markers` - MIT
- `@git-diff-view/*` - MIT
- `papaparse` - MIT
- `@tanstack/react-table` - MIT
- `lz-string` - MIT
- `fflate` - MIT

## Self-hosted mode

The optional self-hosted UUID mode intentionally avoids introducing a heavyweight web stack or a second frontend runtime.

It uses Node.js built-ins for:

- HTTP serving
- SQLite access (`node:sqlite`)
- UUID generation
- filesystem access for serving the exported viewer assets

That keeps the add-on deployment small and aligned with the repo’s preference for minimal surface area.

## Notes

- ISC is permissive and MIT-compatible.
- No GPL, AGPL, or SSPL dependencies are planned for the project.
- If a future dependency has unclear licensing, stop and review before adoption.
- `node:sqlite` is an experimental Node built-in as of current Node 22 runtimes; self-hosted operators should use a supported Node release that includes it.

## Why these libraries

- `react-markdown` plus `remark-gfm` plus `rehype-sanitize` covers the markdown path without introducing unsafe raw HTML by default.
- CodeMirror handles raw source and raw JSON well because it is excellent at read-only code presentation.
- `@replit/codemirror-indentation-markers` replaces custom indent-guide logic with a maintained CM6 extension.
- `@git-diff-view/*` fits review-style diffs better than a generic merge editor for the current viewer.
- `papaparse` plus `@tanstack/react-table` keeps CSV parsing and rendering readable without coupling to a heavyweight data-grid framework.
- `fflate` provides portable deflate/inflate support across iOS Safari and Android Chromium without relying on browser-specific compression streams.
- the self-hosted add-on reuses built-in Node capabilities instead of pulling in Express or a third-party SQLite ORM just to store payload strings under UUIDs

## Notable removals

- `rehype-highlight` was removed after review because markdown fences now reuse the CodeMirror viewer stack directly.
- `vanilla-jsoneditor` was removed because its bundle cost was too high for the default JSON tree-view use case in a viewer-first product.
