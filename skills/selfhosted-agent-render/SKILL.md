# Self-Hosted agent-render

## When to use self-hosted mode

Use the self-hosted variant when:

- Payloads exceed the 8,000-character fragment limit of the static viewer
- You want persistent, bookmarkable UUID links instead of long fragment URLs
- You need to avoid chat-platform link mangling (Discord, Slack, Telegram truncate long URLs)
- You want to share artifacts across sessions without re-encoding
- You are working on the same machine as the agent and want a local viewer service

Use the static fragment-based viewer when:

- Payloads fit within fragment limits (under ~6k chars for comfortable chat use)
- You want zero-infrastructure, fully static hosting
- Public sharing without any server component is preferred

## Architecture

The self-hosted variant is a separate Next.js app at `selfhosted/` in the same repo.

It reuses the existing viewer renderers (markdown, code, diff, CSV, JSON) and shell components from the parent `src/` directory, but adds:

- SQLite persistence (via `better-sqlite3`)
- REST API for CRUD operations
- Server-rendered `/{uuid}` routes
- 24-hour sliding TTL with automatic expiry

The static fragment-based app at the repo root is unchanged.

## Deployment

### Option A: Direct process (same machine as agent)

```bash
cd selfhosted
npm install
npm run build
npm run start
# Runs on http://localhost:3001
```

Set the database path if needed:

```bash
ARTIFACTS_DB_PATH=/path/to/artifacts.db npm run start
```

### Option B: Docker Compose

```bash
cd selfhosted
docker compose up -d
```

The `docker-compose.yml` persists the SQLite database in a named volume.

### Option C: pm2 / systemd

```bash
cd selfhosted
npm install
npm run build

# pm2
pm2 start npm --name agent-render -- run start

# or systemd unit
# ExecStart=/usr/bin/npm run start
# WorkingDirectory=/path/to/selfhosted
```

## Creating an artifact

Send a POST request with a payload envelope (same schema as the static viewer):

```bash
curl -X POST http://localhost:3001/api/artifacts \
  -H "Content-Type: application/json" \
  -d '{
    "v": 1,
    "codec": "plain",
    "title": "My artifact",
    "artifacts": [
      {
        "id": "doc-1",
        "kind": "markdown",
        "content": "# Hello\n\nThis is a test."
      }
    ]
  }'
```

Response:

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "created_at": "2026-03-20T12:00:00.000Z",
  "expires_at": "2026-03-21T12:00:00.000Z"
}
```

## Returning a link

After creating an artifact, return the UUID link:

```
https://your-host.com/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

Or for local use:

```
http://localhost:3001/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

## Viewing an artifact

Visit `/{uuid}` in a browser. The server looks up the stored payload and renders the same viewer UI as the static variant.

Feature parity with the static viewer includes:

- Artifact bundle switching (tabs for multiple artifacts)
- Copy to clipboard
- File download
- Markdown print-to-PDF
- Diff unified/split modes
- CodeMirror code highlighting
- CSV grid rendering
- JSON tree + raw toggle
- Dark/light theme

## Deleting an artifact

```bash
curl -X DELETE http://localhost:3001/api/artifacts/{uuid}
```

## Updating an artifact

```bash
curl -X PUT http://localhost:3001/api/artifacts/{uuid} \
  -H "Content-Type: application/json" \
  -d '{ "v": 1, "codec": "plain", "artifacts": [...] }'
```

## TTL behavior

- Every successful GET/view extends `expires_at` by 24 hours (sliding window)
- Expired entries return 404 and are cleaned up lazily on read
- Manual cleanup via `POST /api/cleanup` removes all expired rows
- You can ask your agent to call the cleanup endpoint periodically

## Cleanup guidance

Trigger cleanup:

```bash
curl -X POST http://localhost:3001/api/cleanup
```

Or schedule it:

```bash
# crontab -e
0 */6 * * * curl -s -X POST http://localhost:3001/api/cleanup
```

Agents can also call the cleanup endpoint as part of maintenance workflows.

## Auth / perimeter protection

The self-hosted app does not include built-in authentication. Choose your own perimeter:

### Local-only (simplest)

Bind to localhost only. No external access needed.

```bash
# In next.config.ts or process env
HOSTNAME=127.0.0.1 npm run start
```

### Cloudflare Tunnel + Zero Trust (recommended for public exposure)

1. Install `cloudflared`
2. Create a tunnel pointing to `http://localhost:3001`
3. Enable Cloudflare Zero Trust policies for access control
4. No changes needed in the app itself

### Reverse proxy with basic auth

Use nginx/caddy with basic auth or OAuth proxy in front of the app.

### VPN / Tailscale

Run on a Tailscale node. Access via tailnet IP. No public exposure needed.

## Envelope format

The API accepts the same payload envelope format as the static viewer's fragment transport:

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Optional bundle title",
  "activeArtifactId": "doc-1",
  "artifacts": [
    {
      "id": "doc-1",
      "kind": "markdown",
      "title": "Optional title",
      "filename": "readme.md",
      "content": "# Content here"
    }
  ]
}
```

Supported artifact kinds: `markdown`, `code`, `diff`, `csv`, `json`.

For diff artifacts, use either `patch` (unified git patch string) or `oldContent` + `newContent`.

## Limitations vs. static mode

- Requires a running server process
- SQLite database must be backed up separately if persistence matters
- No built-in auth (use perimeter protection)
- Links depend on server availability (not self-contained like fragment URLs)

## File locations

| Component | Path |
|-----------|------|
| Self-hosted app | `selfhosted/` |
| Database module | `selfhosted/src/lib/db.ts` |
| Artifact CRUD | `selfhosted/src/lib/artifacts.ts` |
| API routes | `selfhosted/src/app/api/artifacts/` |
| Viewer shell | `src/components/selfhosted-viewer-shell.tsx` |
| Docker Compose | `selfhosted/docker-compose.yml` |
