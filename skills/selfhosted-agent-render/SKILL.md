---
name: selfhosted-agent-render
description: Create and manage agent-render artifacts via a self-hosted UUID-based server. Use when an agent needs public/share-friendly rendered artifacts through short UUID links instead of fragment-encoded URLs. Ideal for public/social sharing, corporate proxy/link-scanning environments, payloads that exceed the ~8 KB fragment budget, platforms that mangle long URLs, or when the agent and viewer run on the same machine. Supports markdown, code, diffs, CSV, JSON, kit HTML, and choices — same artifact kinds as the fragment-based product (the server stores the payload string after a length/non-empty check; full envelope validation happens client-side when the viewer renders). The self-hosted server stores payloads in SQLite with a configurable sliding TTL that defaults to seven days.
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

Discovery: `GET /.well-known/api-catalog` returns RFC 9727 `application/linkset+json` with an `item` link to `/api/artifacts` and `service-desc` metadata pointing to the OpenAPI file for this optional self-hosted API.

When `AGENT_RENDER_PASSWORD` is set, send it as a bearer token on API write requests:

```http
Authorization: Bearer <AGENT_RENDER_PASSWORD>
```

The same-origin browser authentication cookie is also accepted. Missing or invalid credentials on a protected route return `401` with a bearer challenge. Artifact API reads are gated with the same credentials, so agents fetching stored artifacts need the bearer header too.

### Create an artifact

```http
POST /api/artifacts
Content-Type: application/json
Authorization: Bearer <AGENT_RENDER_PASSWORD>

{
  "payload": "p<base64url-encoded-json>"
}
```

Response (`201`):

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "expires_at": "2025-04-08T12:00:00.000Z"
}
```

The `payload` field is the same payload string used in fragment links — the compact fragment body after `#` (a single codec tag char followed by the payload). Use the same envelope format and codecs (`plain`, `lz`, `deflate`, `arx`, `arx2`, `arx3`, `arx4`) described in the `agent-render-linking` skill. The legacy `agent-render=v1.<codec>.<payload>` form (arx-family carry an extra `<dictVersion>.` segment) is also accepted for back-compatibility.

### Read an artifact

```http
GET /api/artifacts/:id
```

Response (`200`):

```json
{
  "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "payload": "p<payload>",
  "created_at": "2025-04-07T12:00:00.000Z",
  "updated_at": "2025-04-07T12:00:00.000Z",
  "last_viewed_at": "2025-04-07T14:00:00.000Z",
  "expires_at": "2025-04-08T14:00:00.000Z"
}
```

Each successful read extends the TTL by the configured duration (seven days by default).

### Update an artifact

```http
PUT /api/artifacts/:id
Content-Type: application/json
Authorization: Bearer <AGENT_RENDER_PASSWORD>

{
  "payload": "p<new-payload>"
}
```

### Delete an artifact

```http
DELETE /api/artifacts/:id
Authorization: Bearer <AGENT_RENDER_PASSWORD>
```

### Cleanup expired

```http
POST /api/cleanup
Authorization: Bearer <AGENT_RENDER_PASSWORD>
```

Response: `{ "deleted": 5 }`

The server also sweeps expired rows automatically on startup and once an hour, so this endpoint is only needed for on-demand cleanup.

### Health check

```http
GET /health
```

Returns `200 { "status": "ok" }` when the server is up and the database is reachable, or `503 { "status": "error" }` otherwise. The check has no TTL side effects, so monitors can poll it without keeping artifacts alive. The Docker Compose deployment uses it as a container health check.

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

#### Kit HTML

**Required:** `content` (string) — HTML using the shipped design kit (`ar-*` classes; see `docs/design-kit.md`). Fragment links render this sanitized; server-injected self-hosted payloads render verbatim in a sandboxed (origin-isolated) frame.

```json
{
  "id": "report",
  "kind": "html",
  "content": "<div class=\"ar-grid\"><div class=\"ar-stat\"><p class=\"ar-stat-label\">Build</p><p class=\"ar-stat-value\">Passing</p></div></div>"
}
```

#### Choices

**Required:** non-empty `options` array (max 50), each with `id` and `label` (optional `detail`). Optional `prompt` and `multi`. Presentational: the user answers in chat.

```json
{
  "id": "next-steps",
  "kind": "choices",
  "prompt": "Which follow-ups land first?",
  "multi": true,
  "options": [
    { "id": "a", "label": "Fix the TTL", "detail": "off by one hour" },
    { "id": "b", "label": "Document auth" }
  ]
}
```

> **Common mistake:** Diff artifacts do NOT use a `content` field. Use `patch` for unified diffs or provide both `oldContent` and `newContent`. A `content` field on a diff artifact will fail envelope validation.

Encode the envelope using the same codec pipeline as fragment links:

1. Serialize envelope as compact JSON
2. Encode with a codec (`plain` = base64url, `lz` = lz-string, `deflate` = deflate + base64url, or the async arx/arx2/arx3 pipelines; `arx4` is emitted by the app only, since its context mixer is not hand-rollable)
3. Prepend the single-character codec tag (`p` plain, `l` lz, `d` deflate, `a` arx, `b` arx2, `c` arx3, `e` arx4)
4. POST the resulting string as the `payload` field

> **`html` and `choices` artifacts must not use `arx2`, `arx3`, or `arx4`.** Those codecs use a pinned tuple wire format whose kind table predates both kinds, so such a payload stores fine and then fails to decode in the viewer. Use `plain`, `lz`, `deflate`, or `arx` (automatic codec selection already excludes the tuple codecs for these kinds).

For simple cases, `plain` codec is sufficient:

```text
p<base64url(JSON.stringify(envelope))>
```

## TTL behavior

- Artifacts expire seven days after creation by default
- Set `AGENT_RENDER_TTL_HOURS` to a positive integer to change the sliding TTL
- Every successful read (API or viewer) extends the expiry by the configured duration
- Expired artifacts return 404 and are lazily cleaned up on access
- The server also sweeps expired rows automatically on startup and once an hour
- Run `POST /api/cleanup` to batch-remove all expired artifacts on demand

## Deployment

### Same-machine setup (recommended for agents)

The simplest deployment is running the server on the same machine as the agent:

```bash
# Build the frontend
npm run build

# Start the self-hosted server
npm run selfhosted:dev
```

The server runs on port 3000 by default. Set `PORT` and `DB_PATH` to customize it. `AGENT_RENDER_TTL_HOURS` controls the sliding TTL and defaults to `168`; `AGENT_RENDER_PASSWORD` enables the built-in shared-secret auth fallback.

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

Prefer your own reverse proxy or identity-aware access layer when authentication is required. It can protect every route and provide stronger policy, SSO, auditing, and secret management. The built-in `AGENT_RENDER_PASSWORD` option is a fallback for small or local deployments.

When `AGENT_RENDER_PASSWORD` is unset, anyone who can reach the server can create, read, update, and delete artifacts. When it is set:

- `POST`, `PUT`, and `DELETE` API requests require `Authorization: Bearer <AGENT_RENDER_PASSWORD>` or the server-issued authentication cookie.
- Stored UUID viewer pages and static HTML pages require the authentication cookie. Without it, the server returns a `401` sign-in page; submitting the password form to `/auth` sets an `HttpOnly`, `SameSite=Lax` cookie and redirects back to the requested page. The cookie is marked `Secure` only when the request arrived over TLS, so it works on a direct-HTTP LAN or Tailscale deployment; behind a TLS-terminating proxy set `AGENT_RENDER_TRUST_PROXY=1` so `X-Forwarded-Proto: https` is honored.
- `GET /api/artifacts/:id` requires the same credentials; static assets, API discovery, and `GET /health` remain open.
- Protected API requests without valid credentials return `401 Unauthorized` with a bearer challenge.

The built-in password therefore protects writes, browser entry points, and artifact API reads with one shared secret. Put the deployment behind a reverse proxy or identity-aware proxy when you need per-user access instead of a shared password.

### Cloudflare Tunnel + Zero Trust

For exposing the server securely to the internet:

1. Install `cloudflared` on the server machine
2. Create a tunnel: `cloudflared tunnel create agent-render`
3. Route a domain to the tunnel: `cloudflared tunnel route dns agent-render render.yourdomain.com`
4. Run the tunnel: `cloudflared tunnel run agent-render`
5. Add a Cloudflare Access policy in the Zero Trust dashboard to control who can reach the server

This gives you authentication, access logs, and DDoS protection without modifying the application.

### Other reverse proxies

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
  -H "Authorization: Bearer $AGENT_RENDER_PASSWORD" \
  -d "{\"payload\": \"p$PAYLOAD\"}"
```

## Cleanup guidance

Artifacts auto-expire after seven days of inactivity by default, and the server sweeps expired rows on startup and hourly, so storage reclaims itself. Set `AGENT_RENDER_TTL_HOURS` to a positive integer to choose another duration. For proactive cleanup:

- Call `POST /api/cleanup` to remove all expired artifacts immediately
- Call `DELETE /api/artifacts/:id` to remove specific artifacts

## Good defaults

- Use self-hosted mode for public sharing, large payloads, corporate-proxy contexts, or agent-driven workflows
- Use fragment links for quick, trusted direct shares that fit in the budget
- Keep the server on the same machine as the agent for simplicity
- Put remote deployments behind your existing authenticated reverse proxy
- Use `AGENT_RENDER_PASSWORD` only as a small-deployment fallback
- Let TTL handle cleanup for most cases

## Future encrypted short-link mode

A future design could encrypt the payload before upload, store only ciphertext in SQLite, and keep the decryption key in the URL fragment. That would preserve the short UUID path while preventing the server from reading plaintext. This skill must not assume that mode exists until the implementation ships.
