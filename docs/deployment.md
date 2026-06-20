# Deployment

## Static hosting

`agent-render` is a static export and can be deployed to any host that serves files from `out/`.

Automated API discovery ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727)): the static export includes `.well-known/api-catalog` as a Linkset JSON document for the optional self-hosted HTTP API. It advertises `/api/artifacts` and points to the OpenAPI description at `/openapi/selfhosted-artifacts.yaml`; hosts should serve the extensionless catalog with the `application/linkset+json` media type when possible.

The catalog describes the optional self-hosted API. Pure static deployments must also expose the self-hosted server for `/api/artifacts` to exist. RFC well-known discovery resolves from the origin root, so `/.well-known/api-catalog` must be served there. Subpath-only deployments may need host rewrites or copied files for the catalog and `/openapi/selfhosted-artifacts.yaml` hrefs.

Key details:

- Build with `npm ci` and `npm run build`
- Upload the generated `out/` directory to your static host
- Set **`NEXT_PUBLIC_SITE_URL`** to your public origin (for example `https://example.com`) so `sitemap.xml` and metadata resolve to the correct canonical origin in the static export.
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

The preview server reads the generated build manifest, serves `out/` under `/agent-render/`, and keeps root requests working for convenience. Open the sample fragment links from the landing page.

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

The repository includes an optional self-hosted server that stores artifact payloads in SQLite and serves them under UUID links. This is a separate deployment from the static export and is intended for power users, agents, and public sharing contexts where short stable URLs work better than long fragments.

Choose the sharing mode by audience:

- **Fragment links**: best for trusted direct sharing when the payload fits the fragment budget and static zero-retention matters.
- **UUID links**: best for public, social, email, Slack/Teams, or corporate-proxy contexts where long fragment URLs look suspicious, get truncated, or are rewritten.

Current UUID links are server-retained: the server stores the encoded payload until the TTL expires or the artifact is deleted. Do not describe UUID mode as zero-retention unless an encrypted short-link design is implemented.

### Quick start

```bash
npm ci
npm run build
npm run selfhosted:dev
```

The server starts on port 3000. Create artifacts via `POST /api/artifacts` and view them at `http://localhost:3000/{uuid}`. It also serves the static RFC 9727 catalog at `GET /.well-known/api-catalog`.

### Environment variables

| Variable             | Default                  | Description                                            |
| -------------------- | ------------------------ | ------------------------------------------------------ |
| `PORT`               | `3000`                   | Server listen port                                     |
| `HOST`               | `0.0.0.0`                | Server bind address                                    |
| `DB_PATH`            | `./data/agent-render.db` | SQLite database file path                              |
| `OUT_DIR`            | `out`                    | Path to the static build output                        |
| `SHUTDOWN_GRACE_MS`  | `5000`                   | Drain window on SIGTERM/SIGINT before a forced (non-zero) exit |

### Docker Compose

```bash
cd selfhosted
docker compose up -d
```

This builds the frontend, compiles the server, and starts it with a persistent SQLite volume. The Compose service defines a health check that polls `GET /health`, so `docker ps` and orchestrators report container health.

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

Artifacts have a 24-hour sliding TTL. Each successful view extends the expiry. Expired entries are lazily cleaned on read, swept automatically on startup and once an hour, and can be batch-removed on demand via `POST /api/cleanup`.

### Auth and access control

The self-hosted server does not include built-in authentication. Options for protecting it:

- **Public**: No additional configuration. Recommended for public/non-sensitive artifacts that benefit from short share-friendly links.
- **Cloudflare Tunnel + Zero Trust**: Expose the server through a Cloudflare Tunnel and add Access policies for authentication. This is the recommended approach for remote access with SSO.
- **Reverse proxy**: Place behind nginx, Caddy, or Traefik with HTTP basic auth, OAuth2 proxy, or mTLS.
- **Local only**: Set `HOST=127.0.0.1` to bind to localhost only.

Every response carries baseline hardening headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `X-Frame-Options: SAMEORIGIN`. HTML responses additionally carry a strict **`Content-Security-Policy`**. Its `script-src` allows only same-origin scripts, the build's own inline scripts (by `sha256` hash, derived at runtime from the served `index.html` so they never drift from the build), and — on a stored-artifact viewer page — the injected payload bootstrap (by a per-response `nonce`). So even if a renderer dependency regressed into an injection sink, attacker-controlled inline script in a stored payload cannot execute. It also includes `'wasm-unsafe-eval'`, which the arx-family codecs need to decompress Brotli via WebAssembly — this permits WebAssembly compilation but not JavaScript `eval`, so it is far narrower than `'unsafe-eval'`. The policy also sets `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`, and `form-action 'self'`.

`img-src` and `connect-src` are restricted to same-origin (plus `data:`/`blob:`). This is deliberate: because the server **stores** the payload, an artifact cannot beacon out or load a tracking pixel from a cross-origin URL. The tradeoff is that a legitimately cross-origin image referenced inside an artifact will not render on the self-hosted viewer (it loads fine on the fragment-based static product, which ships no such policy) — widen `img-src` at a reverse proxy if cross-origin images are a use case you need.

`style-src` intentionally keeps `'unsafe-inline'`: the static export and mermaid emit inline styles a strict style policy would break, and styles are a lower-risk surface than scripts — the high-value lockdown is on `script-src`. The script hashes are read from the exact HTML file being served (each exported route — `/`, `/security`, `/url-explainer`, `/404` — ships different inline scripts), so a rebuild updates them automatically on the next restart. The self-hosted unit tests pin the header contract and per-route hashing; because they do not run a browser, re-verify rendering after a dependency or Next.js upgrade with `npm run build && npm run selfhosted:csp-smoke`, which drives the real server in headless chromium and fails on any CSP violation (a future build needing `eval`/`new Function` or injecting runtime inline scripts would surface there). For an even stricter policy (e.g. hashed styles, or a CSP on non-HTML responses), layer one at a reverse proxy.

### Future encrypted short links

A future mode could encrypt the payload in the browser or agent, store only ciphertext under the UUID, and keep the decryption key in the URL fragment. That would make the short-link server unable to read plaintext while still giving users a short public URL shape. This repository does not implement that mode today.

### Same-machine deployment

The simplest pattern is running the server on the same machine as the agent. The agent creates artifacts via `http://localhost:3000/api/artifacts` and returns viewer links. No network exposure required unless you want remote access.

### Relationship to static mode

The self-hosted mode is an add-on. The existing static export (`npm run build` → `out/`) remains the default product. The self-hosted server serves those same static files plus the API and UUID routes. The two modes can coexist in the same repository without conflict.
