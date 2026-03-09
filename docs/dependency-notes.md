# Dependency Notes

## Phase 1 selections

- `next` - MIT
- `react` / `react-dom` - MIT
- `tailwindcss` / `@tailwindcss/postcss` - MIT
- `react-markdown` - MIT
- `remark-gfm` - MIT
- `rehype-sanitize` - MIT
- `@codemirror/*` - MIT
- `@git-diff-view/*` - MIT
- `papaparse` - MIT
- `@tanstack/react-table` - MIT
- `vanilla-jsoneditor` - ISC
- `lz-string` - MIT

## Notes

- ISC is permissive and MIT-compatible.
- No GPL, AGPL, or SSPL dependencies are planned for Phase 1.
- If a future dependency has unclear licensing, stop and review before adoption.

## Why these libraries

- `react-markdown` plus `remark-gfm` plus `rehype-sanitize` covers the markdown path without introducing unsafe raw HTML by default.
- CodeMirror handles raw source and raw JSON well because it is excellent at read-only code presentation.
- `@git-diff-view/*` fits review-style diffs better than a generic merge editor for Phase 1.
- `papaparse` plus `@tanstack/react-table` keeps CSV parsing and rendering readable without coupling to a heavyweight data-grid framework.
- `vanilla-jsoneditor` provides a mature JSON tree view while still working in a static client-only setup.
