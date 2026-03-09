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

## Renderer implementation

- `markdown` - formatted document view with download and print-to-PDF flow
- `code` - read-only CodeMirror view with syntax-aware rendering and code affordances
- `diff` - review-style diff view with unified and split modes
- `csv` - table-focused data grid built from parsed rows and dynamic columns
- `json` - read-only tree view backed by `vanilla-jsoneditor` plus a raw CodeMirror view

The viewer shell now routes all five artifact kinds through dynamically imported client-only renderers so the landing shell stays light and static-host friendly.

## Diff choice

Phase 1 uses `@git-diff-view/react` plus `@git-diff-view/file` instead of `@codemirror/merge`.

- `@git-diff-view/*` matches the product goal better because it is already shaped like a GitHub-style review surface
- split and unified views are built in
- syntax highlighting and diff affordances are stronger out of the box for artifact viewing
- CodeMirror remains the better fit for raw source and raw JSON views

`@codemirror/merge` stays a reasonable future option if Phase 2 needs a more editor-centric comparison workflow, but it is not the best Phase 1 default for shareable review artifacts.

## Security posture

- Treat every payload as untrusted input
- Disable raw HTML in markdown by default
- Keep artifact text out of `dangerouslySetInnerHTML`
- Sanitize any content pipeline that can introduce markup

## Zero-retention boundaries

The static host does not receive fragment contents as part of the request, but Phase 1 is not absolute secrecy.

- artifact data still exists in copied links
- artifact data can remain in browser history
- client-side analytics would still be able to observe decoded payloads if added later
- very large artifacts can exceed practical URL-sharing limits, which is why the shell enforces a fragment budget

## Routing and hosting constraints

- `output: "export"`
- GitHub Pages-compatible `basePath` and `assetPrefix`
- `.nojekyll` included for Pages compatibility
- Fragment size budget enforced before render
