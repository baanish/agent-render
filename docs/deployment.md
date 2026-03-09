# Deployment

## Static hosting

`agent-render` is a static export and can be deployed to any host that serves files from `out/`.

Key details:

- Build with `npm ci` and `npm run build`
- Upload the generated `out/` directory to your static host
- Set `NEXT_PUBLIC_BASE_PATH` only when you need a subpath deployment
- `.nojekyll` remains harmless for hosts that ignore it

## Local verification

Before publishing, verify:

```bash
npm run check
```

Then serve the exported output from `out/` with any static file server.

For a subpath deployment check, build with:

```bash
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
npm run preview
```

Then serve `out/` under `/agent-render/` and open the sample fragment links from the landing page.

The preview server intentionally preserves the fragment payload and does not rely on hash-based in-page navigation for diff files.

## Hosting model

The project does not require a Node.js runtime. Any static host that can serve HTML, CSS, and JavaScript is sufficient.

## Cloudflare Pages

Cloudflare Pages works well with the current project shape.

- Build command: `npm run build`
- Build output directory: `out`
- Environment variable: set `NEXT_PUBLIC_BASE_PATH` only if you intentionally deploy under a subpath

If you deploy at the domain root on Cloudflare Pages, leave `NEXT_PUBLIC_BASE_PATH` unset.
