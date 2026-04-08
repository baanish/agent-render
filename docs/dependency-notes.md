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
- `mermaid` - MIT
- `better-sqlite3` - MIT (self-hosted mode only)

## Notes

- ISC is permissive and MIT-compatible.
- No GPL, AGPL, or SSPL dependencies are planned for the project.
- If a future dependency has unclear licensing, stop and review before adoption.

## Why these libraries

- `react-markdown` plus `remark-gfm` plus `rehype-sanitize` covers the markdown path without introducing unsafe raw HTML by default.
- CodeMirror handles raw source and raw JSON well because it is excellent at read-only code presentation.
- `@replit/codemirror-indentation-markers` replaces custom indent-guide logic with a maintained CM6 extension.
- `@git-diff-view/*` fits review-style diffs better than a generic merge editor for the current viewer.
- `papaparse` plus `@tanstack/react-table` keeps CSV parsing and rendering readable without coupling to a heavyweight data-grid framework.
- `fflate` provides portable deflate/inflate support across iOS Safari and Android Chromium without relying on browser-specific compression streams.
- `mermaid` renders diagram definitions (flowcharts, sequence diagrams, etc.) to SVG client-side. Dynamically imported within the markdown renderer so it does not affect initial bundle size.
- `better-sqlite3` provides synchronous SQLite access for the optional self-hosted server mode. Only used by `selfhosted/` code and not bundled into the static frontend export.

## Notable removals

- `rehype-highlight` was removed after review because markdown fences now reuse the CodeMirror viewer stack directly.
- `vanilla-jsoneditor` was removed because its bundle cost was too high for the default JSON tree-view use case in a viewer-first product.
