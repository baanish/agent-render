---
name: selfhosted-agent-render
description: Create and manage agent-render artifacts via a self-hosted UUID-based server. Use when an agent needs public/share-friendly rendered artifacts through short UUID links instead of fragment-encoded URLs. Ideal for public/social sharing, corporate proxy/link-scanning environments, payloads that exceed the ~8 KB fragment budget, platforms that mangle long URLs, or when the agent and viewer run on the same machine. Supports markdown, code, diffs, CSV, and JSON — same artifact kinds and envelope validation as the fragment-based product. The self-hosted server stores payloads in SQLite with a 24-hour sliding TTL.
---

# Self-Hosted Agent Render

Create, view, and manage agent-render artifacts through a self-hosted server that stores payloads under UUID keys.

## When to use self-hosted mode

Use self-hosted UUID mode instead of fragment links when:

- Links will be posted publicly or shared with a broad audience
- Links will pass through corporate proxy, link-scanning, or URL-rewriting systems
- The artifact payload exceeds the ~8,192 character fragment budget
- Links will be shared on platforms that truncate or mangle long URLs (Slack, Teams, email)
- The agent and viewer run on the same machine or local network
- You want stable, short links that do not encode the payload in the URL
- You need to update or delete artifacts after creation

If the payload fits in a fragment and the link is going to trusted direct recipients, prefer fragment-based links using the `agent-render-linking` skill instead. Fragment links are zero-retention by static-host design, require no server, and work on the public `agent-render.com` deployment.

Do not describe current UUID links as zero-retention. The self-hosted server stores the encoded payload until TTL expiry or deletion.

## API

The self-hosted server exposes a simple REST API.

### Create an artifact

```http
POST /api/artifacts
Content-Type: application/json

{
  "payload": "agent-render=v1.plain.<base64url-encoded-json>"
}
```

Response (`201`):

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "expires_at": "2025-04-08T12:00:00.000Z"
}
```

The `payload` field is the same payload string used in fragment links — the fragment body after `#`. Use the same envelope format and codecs (`plain`, `lz`, `deflate`, `arx`) described in the `agent-render-linking` skill.

### Read an artifact

```http
GET /api/artifacts/:id
```

Response (`200`):

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "payload": "agent-render=v1.plain.<payload>",
  "created_at": "2025-04-07T12:00:00.000Z",
  "updated_at": "2025-04-07T12:00:00.000Z",
  "last_viewed_at": "2025-04-07T14:00:00.000Z",
  "expires_at": "2025-04-08T14:00:00.000Z"
}
```

Each successful read extends the TTL by 24 hours.

### Update an artifact

```http
PUT /api/artifacts/:id
Content-Type: application/json

{
  "payload": "agent-render=v1.plain.<new-payload>"
}
```

### Delete an artifact

```http
DELETE /api/artifacts/:id
```

### Cleanup expired

```http
POST /api/cleanup
```

Response: `{ "deleted": 5 }`

## Viewer links

When a user visits `/{uuid}`, the server looks up the stored payload, injects it into the viewer page, and renders the same UI as the fragment-based product. All viewer features work: copy, download, print-to-PDF, diff modes, artifact switching, raw toggle.

Construct viewer links as:

```text
https://<your-host>/<uuid>
```

For example:

```text
https://render.local:3000/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
```

## Envelope format

The payload format is identical to the fragment-based product. Construct a JSON envelope:

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Report",
  "activeArtifactId": "report",
  "artifacts": [
    {
      "id": "report",
      "kind": "markdown",
      "title": "Weekly report",
      "filename": "report.md",
      "content": "# Weekly Report\n\n- Item one\n- Item two"
    }
  ]
}
```

### Supported artifact kinds

Use these shapes inside the `artifacts` array. Examples show a **single artifact object** only (not the full envelope).

#### Markdown

**Required:** `content` (string) — GFM markdown source.

```json
{
  "id": "report",
  "kind": "markdown",
  "title": "Weekly report",
  "filename": "weekly-report.md",
  "content": "# Report\n\n- Item one"
}
```

Markdown supports **mermaid** diagrams via fenced code blocks: use ` ```mermaid ` fences inside `content`; the viewer renders them client-side with theme-aware styling.

#### Code

**Required:** `content` (string). **Optional:** `language` (string) for syntax highlighting.

```json
{
  "id": "snippet",
  "kind": "code",
  "title": "viewer-shell.tsx",
  "filename": "viewer-shell.tsx",
  "language": "tsx",
  "content": "export function ViewerShell() {\n  return <main />;\n}"
}
```

#### Diff

**Do not use `content`.** Validation requires either:

- a string `patch` (preferred: unified git patch), **or**
- both `oldContent` and `newContent` (strings).

**Optional:** `language` (string), `view` — `"unified"` or `"split"` (default behavior follows the product if omitted).

**Patch form** (preferred):

```json
{
  "id": "patch",
  "kind": "diff",
  "title": "viewer-shell.tsx diff",
  "filename": "viewer-shell.patch",
  "patch": "diff --git a/viewer-shell.tsx b/viewer-shell.tsx\n--- a/viewer-shell.tsx\n+++ b/viewer-shell.tsx\n@@ -1 +1 @@\n-old\n+new\n",
  "view": "split"
}
```

**Old/new form** (when you do not have a unified patch):

```json
{
  "id": "compare",
  "kind": "diff",
  "title": "Config change",
  "filename": "config.diff",
  "oldContent": "timeout = 30\n",
  "newContent": "timeout = 60\n",
  "view": "unified"
}
```

A single `patch` string may contain multiple `diff --git` sections.

#### CSV

**Required:** `content` (string) — raw CSV text.

```json
{
  "id": "metrics",
  "kind": "csv",
  "title": "Metrics snapshot",
  "filename": "metrics.csv",
  "content": "name,value\nrequests,42"
}
```

#### JSON

**Required:** `content` (string). The value must be **serialized JSON** (a JSON string containing JSON text), not a nested JSON object.

```json
{
  "id": "manifest",
  "kind": "json",
  "title": "Manifest",
  "filename": "manifest.json",
  "content": "{\n  \"ready\": true\n}"
}
```

> **Common mistake:** Diff artifacts do NOT use a `content` field. Use `patch` for unified diffs or provide both `oldContent` and `newContent`. A `content` field on a diff artifact will fail envelope validation.

Encode the envelope using the same codec pipeline as fragment links:

1. Serialize envelope as compact JSON
2. Encode with a codec (`plain` = base64url, `lz` = lz-string, `deflate` = deflate + base64url)
3. Prepend `agent-render=v1.<codec>.`
4. POST the resulting string as the `payload` field

For simple cases, `plain` codec is sufficient:

```text
agent-render=v1.plain.<base64url(JSON.stringify(envelope))>
```

## TTL behavior

- Artifacts expire 24 hours after creation
- Every successful read (API or viewer) extends the expiry by another 24 hours
- Expired artifacts return 404 and are lazily cleaned up on access
- Run `POST /api/cleanup` to batch-remove all expired artifacts
- You can ask your agent to periodically clean up old records if desired

## Deployment

### Same-machine setup (recommended for agents)

The simplest deployment is running the server on the same machine as the agent:

```bash
# Build the frontend
npm run build

# Start the self-hosted server
npm run selfhosted:dev
```

The server runs on port 3000 by default. Set `PORT` and `DB_PATH` environment variables to customize.

### Docker Compose

```bash
cd selfhosted
docker compose up -d
```

This builds the frontend, sets up SQLite with a persistent volume, and starts the server.

### Daemon / systemd

For a systemd-managed deployment:

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

[Install]
WantedBy=multi-user.target
```

Build first with `npm run selfhosted:build` to produce `selfhosted/dist/`.

### pm2

```bash
pm2 start selfhosted/dist/server.js --name agent-render
```

## Auth and access control

The self-hosted server does not include built-in authentication. By default, anyone who can reach the server can create, read, and delete artifacts.

Options for protecting the server:

### Public access

If you want the server to be publicly accessible, no additional configuration is needed. This is the recommended setup for non-sensitive artifacts that need short, share-friendly public URLs.

### Cloudflare Tunnel + Zero Trust (recommended for remote access)

For exposing the server securely to the internet:

1. Install `cloudflared` on the server machine
2. Create a tunnel: `cloudflared tunnel create agent-render`
3. Route a domain to the tunnel: `cloudflared tunnel route dns agent-render render.yourdomain.com`
4. Run the tunnel: `cloudflared tunnel run agent-render`
5. Add a Cloudflare Access policy in the Zero Trust dashboard to control who can reach the server

This gives you authentication, access logs, and DDoS protection without modifying the application.

### Reverse proxy with auth

Place the server behind nginx, Caddy, or Traefik with HTTP basic auth, OAuth2 proxy, or mTLS.

### Network-level restriction

Bind to `127.0.0.1` (set `HOST=127.0.0.1`) and only allow local access, or restrict access via firewall rules.

## Agent workflow example

A typical agent workflow for creating and sharing an artifact:

1. Construct the JSON envelope with the correct fields for each artifact `kind` (see **Supported artifact kinds**; diff uses `patch` or `oldContent`/`newContent`, not `content`)
2. Encode it (e.g., `plain` codec with base64url)
3. `POST /api/artifacts` with the encoded payload
4. Return the viewer link `https://<host>/<uuid>` to the user

```bash
# Example: create a markdown artifact
PAYLOAD=$(echo -n '{"v":1,"codec":"plain","artifacts":[{"id":"demo","kind":"markdown","content":"# Hello"}]}' | base64 -w0 | tr '+/' '-_' | tr -d '=')

curl -s -X POST http://localhost:3000/api/artifacts \
  -H "Content-Type: application/json" \
  -d "{\"payload\": \"agent-render=v1.plain.$PAYLOAD\"}"
```

## Cleanup guidance

Artifacts auto-expire after 24 hours of inactivity. For proactive cleanup:

- Call `POST /api/cleanup` to remove all expired artifacts
- Call `DELETE /api/artifacts/:id` to remove specific artifacts
- Ask your agent to clean up after sharing, or schedule periodic cleanup

## Good defaults

- Use self-hosted mode for public sharing, large payloads, corporate-proxy contexts, or agent-driven workflows
- Use fragment links for quick, trusted direct shares that fit in the budget
- Keep the server on the same machine as the agent for simplicity
- Use Cloudflare Tunnel if you need remote access with authentication
- Let TTL handle cleanup for most cases

## Future encrypted short-link mode

A future design could encrypt the payload before upload, store only ciphertext in SQLite, and keep the decryption key in the URL fragment. That would preserve the short UUID path while preventing the server from reading plaintext. This skill must not assume that mode exists until the implementation ships.
