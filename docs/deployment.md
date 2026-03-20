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

## Optional self-hosted mode (UUID links + SQLite)

This is a **separate deployment shape** from static fragment hosting. It targets agents and operators who accept a Node runtime, a SQLite file on disk, and **server-side retention** with a **24-hour sliding TTL** (each successful `GET /api/artifacts/:id` extends expiry by another 24h). It is **not** the default product and does not replace Cloudflare Pages–style static hosting.

### How it differs from the static product

| | Static (default) | Self-hosted (optional) |
| --- | --- | --- |
| Runtime | Static files only | Node.js HTTP server |
| Payload location | URL fragment | SQLite keyed by UUID v4 |
| Host sees payload | No (fragment not sent) | Yes (stored server-side) |
| Viewer UI | This repo’s shell | Same shell + build flag |
| Auth | None required | None built-in; use perimeter controls |

### Build the client bundle for UUID routes

The static export must include the self-hosted client switch:

```bash
NEXT_PUBLIC_SELFHOSTED_SERVER=1 npm run build
```

Omit this variable for normal static deployments (including `agent-render.com`). When the flag is absent, `/{uuid}` paths are not treated as artifact routes in the client.

### Run the server

From the repository root (after `npm run build`):

```bash
npm run selfhosted:start
```

Environment variables:

- `PORT` — listen port (default `3000`)
- `DATABASE_PATH` — SQLite file path (default `./data/artifacts.sqlite`)
- `STATIC_ROOT` — directory containing the static export (default `./out`)
- `NEXT_PUBLIC_BASE_PATH` — must match how the static assets were built (same as static deployment)

### HTTP API

All routes respect `NEXT_PUBLIC_BASE_PATH` when set.

- `POST /api/artifacts` — body `{ "payload": "agent-render=v1...." }` → `201` with `id`, `createdAt`, `expiresAt`
- `GET /api/artifacts/:id` — JSON metadata plus `payload`; refreshes sliding TTL
- `PUT /api/artifacts/:id` — replace `payload`, refresh TTL
- `DELETE /api/artifacts/:id` — remove row
- `GET /{uuid}` — serves `index.html` so the client can fetch the artifact API

### TTL and cleanup

- Expired artifacts return `404` with `{ "error": "expired" }` and are removed on read.
- Run `npm run selfhosted:cleanup` on a schedule to delete expired rows in batch.
- Operators can ask an agent to delete specific IDs or vacuum old data.

### Docker Compose

```bash
docker compose -f selfhosted/docker-compose.yml up --build
```

The image runs `npm run build` with `NEXT_PUBLIC_SELFHOSTED_SERVER=1` unless you override build args.

### Perimeter protection (practical, neutral)

Bind to loopback, use a private network, terminate TLS and auth at a reverse proxy, or place the service behind **Cloudflare Tunnel** with optional **Zero Trust** access policies. Public exposure is possible if you deliberately choose it; document retention and TTL for your users.

### Same-machine / agent co-location

A common pattern is to run the server on `127.0.0.1` next to the agent process so share URLs stay on localhost without exposing the SQLite file to the internet.
