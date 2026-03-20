---
name: selfhosted-agent-render
description: Deploy and use the self-hosted agent-render server for UUID-based artifact sharing. Use when agents need persistent, shareable artifact links without fragment-length limits or chat-platform link mangling. The self-hosted variant stores payloads in SQLite under UUID v4 keys and serves the same viewer UI at https://host/{uuid}. Trigger for requests like "set up self-hosted agent-render", "deploy artifact server", "create a persistent artifact link", or when payloads exceed the 8,000-character fragment budget.
---

# Self-Hosted Agent Render

Deploy and use the self-hosted `agent-render` server for persistent UUID-based artifact sharing.

## When to use self-hosted mode

Use the self-hosted variant instead of fragment links when:
- Payloads exceed the 8,000-character fragment budget
- Chat platforms mangle long URLs or Unicode fragments
- You need persistent, short artifact links (e.g., `https://host/{uuid}`)
- You want agents to create and manage artifacts through a simple API
- Fragment-based sharing is not practical for your workflow

For payloads that fit within the fragment budget and do not need persistence, the standard fragment-based `agent-render.com` links are simpler and require no server.

## Architecture

The self-hosted variant is a separate deployment that:
- Runs an Express server with SQLite storage
- Serves the same static viewer UI built from the main app
- Stores artifact payloads (standard `agent-render` envelope JSON) under UUID v4 keys
- Serves `/{uuid}` routes that render stored artifacts through the existing viewer
- Provides a CRUD API at `/api/artifacts`
- Implements 24-hour sliding TTL (each successful view extends expiry by 24 hours)

The existing static fragment-based app is unaffected and remains the default product.

## Deployment

### Prerequisites

1. Node.js 20+ installed
2. The main app built first: `cd /path/to/agent-render && npm ci && npm run build`

### Quick start (daemon/service style)

```bash
# From the repo root
npm ci && npm run build

# Set up the self-hosted server
cd selfhosted
npm install

# Configure (optional, defaults work for local use)
cp .env.example .env
# Edit .env to set BASE_URL, PORT, etc.

# Start the server
npm start
```

The server runs at `http://localhost:3001` by default.

### Docker Compose

```bash
cd selfhosted
docker compose up -d
```

Set `BASE_URL` in your environment or in `selfhosted/docker-compose.yml` to match your public URL.

### systemd service (example)

```ini
[Unit]
Description=agent-render self-hosted server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/agent-render/selfhosted
ExecStart=/usr/bin/node --import tsx src/server.ts
Environment=PORT=3001
Environment=STATIC_DIR=/opt/agent-render/out
Environment=DB_PATH=/opt/agent-render/selfhosted/data/agent-render.db
Environment=BASE_URL=https://render.example.com
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### pm2

```bash
cd selfhosted
pm2 start "node --import tsx src/server.ts" --name agent-render
```

## API

### Create an artifact

```bash
curl -X POST http://localhost:3001/api/artifacts \
  -H 'Content-Type: application/json' \
  -d '{
    "payload": {
      "v": 1,
      "codec": "plain",
      "title": "My artifact",
      "artifacts": [{
        "id": "main",
        "kind": "markdown",
        "content": "# Hello World\n\nThis is a test."
      }]
    }
  }'
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "url": "http://localhost:3001/550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2025-01-15 10:30:00",
  "expires_at": "2025-01-16 10:30:00"
}
```

The `payload` field accepts either:
- A JSON object (the envelope, will be serialized)
- A JSON string (the serialized envelope)

### View an artifact

Open the URL in a browser:
```
http://localhost:3001/550e8400-e29b-41d4-a716-446655440000
```

Or fetch via API:
```bash
curl http://localhost:3001/api/artifacts/550e8400-e29b-41d4-a716-446655440000
```

### Update an artifact

```bash
curl -X PUT http://localhost:3001/api/artifacts/550e8400-e29b-41d4-a716-446655440000 \
  -H 'Content-Type: application/json' \
  -d '{"payload": {"v": 1, "codec": "plain", "artifacts": [{"id": "main", "kind": "markdown", "content": "# Updated"}]}}'
```

### Delete an artifact

```bash
curl -X DELETE http://localhost:3001/api/artifacts/550e8400-e29b-41d4-a716-446655440000
```

### Cleanup expired artifacts

```bash
curl -X POST http://localhost:3001/api/cleanup
```

Or use the standalone cleanup script:
```bash
cd selfhosted && npm run cleanup
```

You can also ask your agent to clean up old database records on a schedule.

## Payload format

The self-hosted server stores the standard `agent-render` envelope JSON. The same envelope format documented in `docs/payload-format.md` applies:

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Artifact bundle title",
  "activeArtifactId": "artifact-1",
  "artifacts": [
    {
      "id": "artifact-1",
      "kind": "markdown",
      "title": "Report",
      "content": "# Report content"
    }
  ]
}
```

Supported artifact kinds: `markdown`, `code`, `diff`, `csv`, `json`.

The `codec` field should be set to `"plain"` for self-hosted payloads since no fragment encoding is needed. The server stores the envelope as-is.

## TTL behavior

- New artifacts expire 24 hours after creation
- Each successful view (browser or API) extends expiry by another 24 hours (sliding window)
- Expired artifacts return 404 and are not rendered
- Cleanup happens lazily on read (expired entries are filtered by query) and can also be triggered explicitly via `POST /api/cleanup` or the `npm run cleanup` script

## Supported artifacts

The self-hosted viewer supports the same artifact kinds as the fragment-based viewer with full feature parity:

- **Markdown**: GFM rendering, copy, download, print-to-PDF
- **Code**: CodeMirror with syntax highlighting, line numbers, wrap toggle
- **Diff**: git patch viewer with unified/split modes
- **CSV**: parsed table view with sticky headers
- **JSON**: tree view plus raw code fallback

## Same-machine deployment

The simplest deployment pattern is running the self-hosted server on the same machine as your agent:

1. Build the main app and start the server locally
2. The agent creates artifacts via `http://localhost:3001/api/artifacts`
3. The agent returns the UUID link to users
4. Users access the link directly (if the machine is reachable) or through a tunnel

This avoids network latency and keeps the setup minimal.

## Optional auth and perimeter protection

The self-hosted server does not include built-in authentication. You can make it public if you want.

For private deployments, consider:

### Cloudflare Tunnel + Zero Trust (recommended)

1. Install `cloudflared` and create a tunnel to your server
2. Configure a Cloudflare Access application with your identity provider
3. Users authenticate through Cloudflare before reaching the server
4. TTL refresh happens on each authenticated access

```bash
cloudflared tunnel --url http://localhost:3001
```

### Reverse proxy with auth

Use nginx, Caddy, or Traefik with basic auth, OAuth2 Proxy, or your preferred auth middleware in front of the server.

### Network-level access control

For same-machine deployments, bind to `127.0.0.1` only:
```
PORT=3001
# Server only listens on localhost
```

## Agent workflow example

A typical agent workflow for creating and sharing an artifact:

```
1. Agent generates content (markdown report, code, diff, etc.)
2. Agent POSTs the envelope to /api/artifacts
3. Agent receives the UUID and URL in the response
4. Agent shares the URL with the user: https://render.example.com/{uuid}
5. User opens the link and sees the full artifact viewer
6. Each view extends the artifact's TTL by 24 hours
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DB_PATH` | `./data/agent-render.db` | SQLite database path |
| `STATIC_DIR` | `../out` | Path to built static export |
| `BASE_URL` | `http://localhost:3001` | Base URL for generated links |
| `TTL_HOURS` | `24` | Artifact TTL in hours |

## Avoid

- Do not use this for the main fragment-based sharing workflow — use `agent-render.com` or your own static deployment for that
- Do not store sensitive secrets in artifacts without perimeter protection
- Do not assume artifacts persist beyond the TTL without viewer activity
- Do not modify the fragment-based transport or viewer behavior — the self-hosted mode is an add-on, not a replacement
