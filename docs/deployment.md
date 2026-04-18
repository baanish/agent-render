# Deployment

## Static hosting

`agent-render` is a static export and can be deployed to any host that serves files from `out/`.

Automated API discovery ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727)): the build emits `out/.well-known/api-catalog` as `application/linkset+json`, listing the optional self-hosted HTTP API (OpenAPI, docs, health). Hosts must serve extensionless files with that media type or use a platform-specific rewrite to the built file.

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

## Self-hosted UUID mode (optional)

The repository includes an optional self-hosted server that stores artifact payloads in SQLite and serves them under UUID links. This is a separate deployment from the static export and is intended for power users and agents.

### Quick start

```bash
npm ci
npm run build
npm run selfhosted:dev
```

The server starts on port 3000. Create artifacts via `POST /api/artifacts` and view them at `http://localhost:3000/{uuid}`. It also serves `GET /.well-known/api-catalog` (RFC 9727) with `Link` headers on `HEAD`, and static `GET /health.json` for the catalog’s `status` link.

### Environment variables

| Variable  | Default                     | Description                    |
| --------- | --------------------------- | ------------------------------ |
| `PORT`    | `3000`                      | Server listen port             |
| `HOST`    | `0.0.0.0`                   | Server bind address            |
| `DB_PATH` | `./data/agent-render.db`    | SQLite database file path      |
| `OUT_DIR` | `out`                       | Path to the static build output|

### Docker Compose

```bash
cd selfhosted
docker compose up -d
```

This builds the frontend, compiles the server, and starts it with a persistent SQLite volume.

To rebuild after code changes:

```bash
docker compose up -d --build
```

### Daemon / systemd

Build the server:

```bash
npm run selfhosted:build
```

Then create a systemd unit:

```ini
[Unit]
Description=agent-render self-hosted server
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/agent-render/selfhosted/dist/server.js
Environment=PORT=3000
Environment=DB_PATH=/var/lib/agent-render/agent-render.db
Restart=on-failure
User=agent-render
WorkingDirectory=/path/to/agent-render

[Install]
WantedBy=multi-user.target
```

### pm2

```bash
npm run selfhosted:build
pm2 start selfhosted/dist/server.js --name agent-render
```

### Storage

The server uses SQLite with WAL mode. The database file is created automatically at the path specified by `DB_PATH`. The parent directory is created if it does not exist.

Artifacts have a 24-hour sliding TTL. Each successful view extends the expiry. Expired entries are lazily cleaned on read and can be batch-removed via `POST /api/cleanup`.

### Auth and access control

The self-hosted server does not include built-in authentication. Options for protecting it:

- **Public**: No additional configuration. Fine for non-sensitive artifacts.
- **Cloudflare Tunnel + Zero Trust**: Expose the server through a Cloudflare Tunnel and add Access policies for authentication. This is the recommended approach for remote access with SSO.
- **Reverse proxy**: Place behind nginx, Caddy, or Traefik with HTTP basic auth, OAuth2 proxy, or mTLS.
- **Local only**: Set `HOST=127.0.0.1` to bind to localhost only.

### Same-machine deployment

The simplest pattern is running the server on the same machine as the agent. The agent creates artifacts via `http://localhost:3000/api/artifacts` and returns viewer links. No network exposure required unless you want remote access.

### Relationship to static mode

The self-hosted mode is an add-on. The existing static export (`npm run build` → `out/`) remains the default product. The self-hosted server serves those same static files plus the API and UUID routes. The two modes can coexist in the same repository without conflict.
