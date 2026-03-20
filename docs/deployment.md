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

## Self-Hosted Variant

The self-hosted deployment is a separate Next.js server app that adds a REST API and SQLite-backed artifact storage. It does NOT use static export.

### Direct process

```bash
cd selfhosted
npm install
npm run build
ARTIFACTS_DB_PATH=./data/artifacts.db npm run start
# Runs on http://localhost:3001
```

### Docker Compose

```bash
cd selfhosted
docker compose up -d
```

### pm2

```bash
cd selfhosted
npm install && npm run build
pm2 start npm --name agent-render -- run start
```

### Key details

- SQLite database at `./data/artifacts.db` (configurable via `ARTIFACTS_DB_PATH`)
- Runs on port 3001 by default
- 24-hour sliding TTL on all stored artifacts
- No built-in auth; use perimeter protection (localhost binding, Cloudflare Tunnel + Zero Trust, reverse proxy with auth, or VPN/Tailscale)
- The self-hosted app is a separate Next.js server app; it does NOT use static export
- See `skills/selfhosted-agent-render/SKILL.md` for the full self-hosted skill
