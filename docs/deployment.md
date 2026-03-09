# Deployment

## GitHub Pages

The repository includes `.github/workflows/deploy.yml` for static deployment to GitHub Pages.

Key details:

- Builds with `npm ci` and `npm run build`
- Sets `NEXT_PUBLIC_BASE_PATH` to the repository name during CI
- Uploads the `out` directory as the Pages artifact
- Includes `.nojekyll` for project-pages compatibility

## Local verification

Before publishing, verify:

```bash
npm run check
```

Then serve the exported output from `out/` with any static file server.

For a GitHub Pages-style subpath check, build with:

```bash
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
```

Then serve `out/` under `/agent-render/` and open the sample fragment links from the landing page.

## Hosting model

Phase 1 does not require a Node.js runtime. Any static host that can serve HTML, CSS, and JavaScript is sufficient.

## GitHub Actions flow

The included workflow runs on pushes to `main` and on manual dispatch. It installs dependencies with `npm ci`, performs the static build with the repository name as `NEXT_PUBLIC_BASE_PATH`, uploads `out/`, and deploys that artifact with the official Pages actions.
