# Deployment

`agent-render` supports two deployment shapes in this repo.

## 1. Static fragment mode

This remains the main/default product.

### Static hosting

- Build with `npm ci` and `npm run build`
- Upload the generated `out/` directory to your static host
- Set `NEXT_PUBLIC_BASE_PATH` only when you need a subpath deployment

### Local verification

```bash
npm run check
```

For a subpath deployment check:

```bash
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
npm run preview
```

### Hosting model

The static mode does not require a Node.js runtime. Any static host that can serve `out/` is sufficient.

### Cloudflare Pages

Cloudflare Pages fits the default product shape well.

- Build command: `npm run build`
- Build output directory: `out`
- Environment variable: set `NEXT_PUBLIC_BASE_PATH` only if intentionally deploying under a subpath

## 2. Optional self-hosted UUID mode

This mode adds a small Node.js service and SQLite while reusing the same viewer assets from `out/`.

### What to build and run

```bash
npm ci
npm run build
npm run start:selfhosted
```

The self-hosted server expects the exported viewer assets to exist in `out/`.

### Environment variables

- `PORT` - HTTP port, default `3000`
- `HOST` - bind host, default `0.0.0.0`
- `AGENT_RENDER_DB_PATH` - SQLite file path, default `.data/agent-render-selfhosted.sqlite`
- `AGENT_RENDER_PUBLIC_ORIGIN` - optional canonical origin for returned UUID links

### Docker Compose pattern

A simple pattern is:

- mount the repo or built app directory into the container
- persist `.data/` as a volume
- run `npm run build && npm run start:selfhosted`
- terminate TLS/auth/proxy concerns at your reverse proxy or tunnel layer

This repo does not force a specific container stack; the important part is preserving the SQLite file and serving the built `out/` assets alongside the server.

### Daemon/service process pattern

A practical non-container deployment is:

1. clone the repo onto the target machine
2. run `npm ci`
3. run `npm run build`
4. start `npm run start:selfhosted` under `systemd`, `pm2`, or similar supervision
5. point a reverse proxy or tunnel at the local port

This works well when the service runs on the same machine as the agent that creates links.

### Same-machine deployment

For private agent workflows, same-machine deployment is often the simplest recommendation:

- the agent creates artifacts through `POST /api/artifacts`
- the service stores them in local SQLite
- links stay short (`http://host/{uuid}`)
- no external database is required

### Auth and perimeter protection

The app itself does not require auth.

Operators may choose any of these patterns:

- public service with no auth
- reverse proxy basic auth
- Tailscale/private LAN exposure
- Cloudflare Tunnel in front of the service
- Cloudflare Zero Trust protecting the route

Be practical: perimeter protection is recommended for private/internal deployments, but the project stays neutral rather than hard-coding a specific auth stack.

### Cloudflare Tunnel / Zero Trust

A practical recommendation for many operators is:

- run the service locally or on a small VPS
- expose it through Cloudflare Tunnel
- optionally require Cloudflare Zero Trust access policies for the hostname

This keeps the app simple while adding perimeter security outside the viewer itself.

### TTL and cleanup

Stored artifacts use a 24-hour sliding TTL.

- every successful read/view extends expiry by another 24 hours
- expired rows do not render
- cleanup happens lazily on access
- manual cleanup is available with:

```bash
npm run cleanup:selfhosted
```

Users can also ask their agent to run cleanup on a schedule or whenever they want to prune old rows.
