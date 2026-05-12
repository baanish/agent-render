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
- CodeMirror handles source artifacts and markdown code fences because it is excellent at read-only code presentation; JSON, markdown raw, and CSV raw views use lighter native source blocks.
- `@replit/codemirror-indentation-markers` replaces custom indent-guide logic with a maintained CM6 extension.
- `@git-diff-view/*` fits review-style diffs better than a generic merge editor for the current viewer. Its pure CSS file is mirrored into `public/vendor/diff-view-pure.css` with a Brotli-compressed `public/vendor/diff-view-pure.css.br` copy by `npm run assets:compress`, and loaded only by the diff renderer; `tests/diff-style-asset.test.ts` keeps those assets in sync with the package copy.
- `papaparse` handles CSV parsing; CSV rendering uses a native read-only table to avoid a data-grid dependency for the shipped static viewer.
- `fflate` provides portable deflate/inflate support across iOS Safari and Android Chromium without relying on browser-specific compression streams.
- `brotli-wasm` provides the arx/arx2 Brotli compression layer, including streaming decompression used to cap expanded output before allocating oversized decoded payloads.
- `mermaid` renders diagram definitions (flowcharts, sequence diagrams, etc.) to SVG client-side. Dynamically imported within the markdown renderer so it does not affect initial bundle size.
- `better-sqlite3` provides synchronous SQLite access for the optional self-hosted server mode. Only used by `selfhosted/` code and not bundled into the static frontend export.

## Notable removals

- `rehype-highlight` was removed after review because markdown fences now reuse the CodeMirror viewer stack directly.
- `vanilla-jsoneditor` was removed because its bundle cost was too high for the default JSON tree-view use case in a viewer-first product.
- `clsx` and `tailwind-merge` were removed because the app only needed simple conditional string joining, and the merge runtime was being pulled into shared client chunks.
- `next-themes` was removed because the static shell only needs to preserve the `theme` localStorage key and synchronize the `html.dark` class.
