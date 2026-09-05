# Dependency Notes

## Current selections

- `next` - MIT
- `react` / `react-dom` - MIT
- `tailwindcss` / `@tailwindcss/postcss` - MIT
- `react-markdown` - MIT
- `remark-gfm` - MIT
- `rehype-sanitize` - MIT
- `@pierre/diffs` and `@pierre/trees` - Apache-2.0
- `papaparse` - MIT
- `lz-string` - MIT
- `fflate` - MIT
- `brotli-wasm` - Apache-2.0
- `mermaid` - MIT
- `better-sqlite3` - MIT (self-hosted mode only)

## Notes

- ISC is permissive and MIT-compatible.
- No GPL, AGPL, or SSPL dependencies are planned for the project.
- If a future dependency has unclear licensing, stop and review before adoption.

## Why these libraries

- `react-markdown` plus `remark-gfm` plus `rehype-sanitize` covers the markdown path without introducing unsafe raw HTML by default.
- `next` pins its nested `postcss` dependency to `8.5.14` via `package.json` overrides so Tailwind CSS v4's `postcss ^8.5.6` peer range is satisfied in the Next.js toolchain.
- `@pierre/diffs` provides every syntax-highlighted surface: review-style patches and before/after content, standalone code artifacts, JSON raw views, markdown code fences, and the `CodeView`/`EditProvider` artifact editor, all through Shiki-backed shadow DOM. `@pierre/trees` adds path-aware navigation only when a flow has multiple files. Both stay inside deferred renderer paths. Compact markdown and JSON source blocks omit wrapping and the file header so they preserve source whitespace; markdown, CSV, and JSON raw views all reuse the same `File` surface as standalone code.
- `papaparse` handles CSV parsing; CSV rendering uses a native read-only table to avoid a data-grid dependency for the shipped static viewer.
- `fflate` provides portable deflate/inflate support across iOS Safari and Android Chromium without relying on browser-specific compression streams.
- `brotli-wasm` provides the arx/arx2/arx3 Brotli compression layer, including streaming decompression used to cap expanded output before allocating oversized decoded payloads. arx4/arx5 use the integer context mixer instead.
- `mermaid` renders diagram definitions (flowcharts, sequence diagrams, etc.) to SVG client-side. Dynamically imported within the markdown renderer so it does not affect initial bundle size.
- `better-sqlite3` provides synchronous SQLite access for the optional self-hosted server mode. Only used by `selfhosted/` code and not bundled into the static frontend export.

## Notable removals

- `rehype-highlight` was removed after review because markdown fences reuse the code renderer directly.
- `@codemirror/*` and `@replit/codemirror-indentation-markers` were removed once standalone code, JSON raw views, markdown fences, and the artifact editor all moved to `@pierre/diffs`, leaving one highlighting stack for the app.
- `vanilla-jsoneditor` was removed because its bundle cost was too high for the default JSON tree-view use case in a viewer-first product.
- `clsx` and `tailwind-merge` were removed because the app only needed simple conditional string joining, and the merge runtime was being pulled into shared client chunks.
- `next-themes` was removed because the static shell only needs to preserve the `theme` localStorage key and synchronize the `html.dark` class.
