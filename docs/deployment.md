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

---

## Self-hosted mode (optional)

The self-hosted variant in `selfhosted/` adds server-backed SQLite storage and UUID-based artifact links. This is a separate add-on deployment, not a replacement for static hosting.

### When to use it

- Payloads exceed the 8,000-character fragment budget
- Chat platforms mangle long or Unicode-heavy URLs
- You want short, persistent `/{uuid}` links
- Agents need a simple API to create and manage artifacts

### Quick start

```bash
# Build the static frontend first
npm ci && npm run build

# Set up the self-hosted server
cd selfhosted
npm install
cp .env.example .env
# Edit .env as needed (BASE_URL, PORT, etc.)
npm start
```

The server starts at `http://localhost:3001`.

### Docker Compose

```bash
cd selfhosted
docker compose up -d
```

Set `BASE_URL` and `PORT` via environment variables or edit `docker-compose.yml`.

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DB_PATH` | `./data/agent-render.db` | SQLite database file path |
| `STATIC_DIR` | `../out` | Path to the built static export |
| `BASE_URL` | `http://localhost:3001` | Base URL for artifact links in API responses |
| `TTL_HOURS` | `24` | Artifact expiry TTL in hours |

### Storage

Uses SQLite with a single `artifacts` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT (PK) | UUID v4 |
| `payload` | TEXT | Envelope JSON |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |
| `last_viewed_at` | TEXT | ISO datetime (nullable) |
| `expires_at` | TEXT | ISO datetime |

An index on `expires_at` supports efficient TTL queries.

### TTL behavior

- 24-hour sliding TTL by default (configurable via `TTL_HOURS`)
- Each successful view extends expiry by the configured TTL
- Expired artifacts return 404
- Cleanup: `POST /api/cleanup` or `cd selfhosted && npm run cleanup`
- You can also ask your agent to clean up old DB records on a schedule

### API

- `POST /api/artifacts` — create an artifact (returns UUID and URL)
- `GET /api/artifacts/:id` — retrieve an artifact (refreshes TTL)
- `PUT /api/artifacts/:id` — update an artifact's payload
- `DELETE /api/artifacts/:id` — delete an artifact
- `POST /api/cleanup` — remove expired artifacts

### Daemon/service deployment

For persistent deployments, use pm2, systemd, or similar:

```bash
# pm2
cd selfhosted && pm2 start "node --import tsx src/server.ts" --name agent-render

# systemd: see skills/selfhosted-agent-render/SKILL.md for a unit file example
```

### Optional auth and perimeter protection

The server does not include built-in auth. For private deployments, consider:

- **Cloudflare Tunnel + Zero Trust**: install `cloudflared`, create a tunnel to your server, and configure Access policies. This is the recommended approach for exposing the server to the internet with identity-based access control.
- **Reverse proxy with auth**: nginx, Caddy, or Traefik with OAuth2 Proxy or basic auth in front of the server.
- **Localhost binding**: for same-machine deployments, the server listens on all interfaces by default. Use a reverse proxy or firewall to restrict access if needed.

The server can also be made fully public if desired.
