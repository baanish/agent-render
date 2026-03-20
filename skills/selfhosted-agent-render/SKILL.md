---
name: selfhosted-agent-render
description: Use the optional self-hosted agent-render UUID mode when an operator wants short server-backed links, private/local deployment, or fragment-free sharing backed by SQLite. Covers deployment, protection, cleanup, and create/view/delete workflows for `https://host/{uuid}` links.
---

# Self-hosted Agent Render

Use this skill when fragment-first sharing is not the best fit and the operator wants the optional server-backed `agent-render` deployment.

## When to use self-hosted mode

Prefer self-hosted UUID mode when:

- the payload is too large or awkward for fragment links
- the target chat surface mangles long fragments
- the operator wants short links like `https://host/{uuid}`
- the service should run on the same machine as the agent
- the deployment is private, internal, or perimeter-protected

Prefer the regular `agent-render-linking` skill when:

- zero-retention-by-host behavior is the priority
- the payload fits comfortably in a fragment
- a static deployment is enough

## Core model

The self-hosted mode stores the existing payload string as-is in SQLite.

Conceptually:

```text
id -> payload_string
```

The stored value is the same payload body used in fragment mode, for example:

```text
agent-render=v1.deflate.<payload>
agent-render=v1.arx.<dictVersion>.<payload>
```

Do not invent a second artifact schema unless the deployment has a separate internal reason to do so.

## Supported artifacts

The shared viewer still supports:

- `markdown`
- `code`
- `diff`
- `csv`
- `json`

Viewer parity remains the goal:

- copy
- file download
- markdown print-to-PDF
- diff unified/split modes
- bundle artifact switching

## TTL behavior

Stored artifacts use a **24-hour sliding TTL**.

- every successful read extends expiry by another 24 hours
- successful `GET /api/artifacts/:id` refreshes TTL
- successful `GET /:id` refreshes TTL
- expired artifacts should fail clearly and not render

In perimeter-authenticated deployments, think of TTL refresh as happening on successful authenticated access.

## API workflow

Base routes:

- `POST /api/artifacts`
- `GET /api/artifacts/:id`
- `PUT /api/artifacts/:id` (optional but supported)
- `DELETE /api/artifacts/:id`
- `GET /:id`

### Create an artifact

Request:

```http
POST /api/artifacts
Content-Type: application/json

{
  "payload": "agent-render=v1.deflate.<payload>"
}
```

Response shape:

```json
{
  "id": "uuid-v4",
  "payload": "agent-render=v1.deflate.<payload>",
  "createdAt": "...",
  "updatedAt": "...",
  "lastViewedAt": null,
  "expiresAt": "...",
  "url": "https://host/{uuid}"
}
```

### View an artifact

Open:

```text
https://host/{uuid}
```

The server looks up the payload string, refreshes TTL, injects the payload into the shared viewer shell, and the browser renders through the normal decode/render path.

### Delete an artifact

```http
DELETE /api/artifacts/{uuid}
```

Use deletion when the artifact should no longer be reachable before TTL expiry.

## Local or same-machine deployment

This is often the best starting point.

### Recommended simple flow

1. deploy the service on the same machine as the agent
2. run `npm run build`
3. run `npm run start:selfhosted`
4. configure the agent to create artifacts via `POST /api/artifacts`
5. return the resulting `https://host/{uuid}` link to the user

This keeps storage local, avoids a separate database service, and still reuses the shipped viewer.

## Deployment options

### Docker Compose

A practical Compose setup should:

- build the app
- persist `.data/` or the configured SQLite file path as a volume
- expose the service port to a reverse proxy or tunnel

### Daemon/service process

A practical non-container setup can run under:

- `systemd`
- `pm2`
- another supervisor

The important part is: build the static viewer export first, then keep the Node service running alongside the SQLite file.

## Protection options

The app does not require built-in auth.

Practical protection choices:

- local-only binding on `127.0.0.1`
- private LAN or Tailscale
- reverse proxy basic auth
- Cloudflare Tunnel
- Cloudflare Zero Trust

## Cloudflare Tunnel / Zero Trust

A good optional recommendation for many operators is:

- run the service locally or on a small VPS
- expose it with Cloudflare Tunnel
- add Cloudflare Zero Trust if the links should stay private to approved users

This gives perimeter protection without complicating the app itself.

## Cleanup guidance

Expired rows are removed lazily on access, but operators should still clean up periodically if they want the SQLite file to stay tidy.

Use:

```bash
npm run cleanup:selfhosted
```

You can also ask your agent to clean up old DB rows on a schedule or whenever you want to prune expired artifacts.

## Agent behavior guidance

When operating in self-hosted mode:

1. encode the artifact with the normal `agent-render` payload format
2. `POST` that payload string to the self-hosted API
3. return the resulting UUID link
4. use `DELETE` for explicit cleanup when appropriate
5. mention the 24-hour sliding TTL when the user should expect expiration behavior

Be clear that this mode is server-backed and SQLite-retained for a limited time. Do not describe it as zero-retention.
