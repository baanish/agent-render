# Deployment

## GitHub Pages

The repository includes `.github/workflows/deploy.yml` for static deployment to GitHub Pages.

Key details:

- Builds with `npm ci` and `npm run build`
- Sets `NEXT_PUBLIC_BASE_PATH` to the repository name during CI
- Uploads the `out` directory as the Pages artifact

## Local verification

Before publishing, verify:

```bash
npm run check
```

Then serve the exported output from `out/` with any static file server.

## Hosting model

Phase 1 does not require a Node.js runtime. Any static host that can serve HTML, CSS, and JavaScript is sufficient.
