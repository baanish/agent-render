# Architecture

## Phase 1 shape

Phase 1 is a single exported client-side shell built with Next.js 15, React 19, and Tailwind CSS 4.

- The application ships as static files only.
- All artifact data lives in the URL fragment.
- The app renders one viewer shell and selects a renderer based on the artifact kind.
- Renderers stay modular so they can evolve independently without coupling to Next.js routing.

## Why a single exported route

GitHub Pages is strongest when the application behaves like a static shell instead of a path-heavy routed app.

- Avoids subpath and refresh traps on project pages
- Keeps payload handling entirely client-side
- Makes deployment portable to any static host

## Renderer plan

- `markdown` - formatted document view with download and print-to-PDF flow
- `code` - read-only code view with syntax-aware rendering
- `diff` - review-style diff view with unified and split modes when appropriate
- `csv` - table-focused data grid
- `json` - tree and raw-code views

## Security posture

- Treat every payload as untrusted input
- Disable raw HTML in markdown by default
- Keep artifact text out of `dangerouslySetInnerHTML`
- Sanitize any content pipeline that can introduce markup

## Routing and hosting constraints

- `output: "export"`
- GitHub Pages-compatible `basePath` and `assetPrefix`
- `.nojekyll` included for Pages compatibility
- Fragment size budget enforced before render
