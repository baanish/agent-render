---
name: selfhosted-agent-render
description: Run and use the optional self-hosted agent-render server that stores canonical fragment-shaped payloads in SQLite behind UUID URLs. Use when fragment links are too large, mangled by chat platforms, or when the same machine as the agent should hold artifacts. Covers Docker Compose, daemon-style processes, CRUD API, sliding TTL, perimeter auth, and Cloudflare Tunnel / Zero Trust as optional hardening.
---

# Self-hosted agent-render (UUID + SQLite)

## When to use this instead of fragment links

Prefer the **static fragment product** (`skills/agent-render-linking`) when:

- the payload fits the fragment budget and survives your chat surface
- you want the default zero server-retention static deployment story

Use **self-hosted UUID mode** when:

- payloads are large or you want to skip fragment length pressure entirely
- chat platforms rewrite, truncate, or break long `#agent-render=...` links
- the agent and viewer can share a private network or the same host
- you accept **server-side retention** (SQLite file) with a **24h sliding TTL**

The stored string is still the normal `agent-render=v1.<codec>.<payload>` body (no new artifact schema). The viewer shell is the same; only transport changes.

## Build-time switch

The static export must be built with:

```bash
NEXT_PUBLIC_SELFHOSTED_SERVER=1 npm run build
```

Without this, the client will not treat `/{uuid}` paths as server-backed artifacts (keeps the default static-only behavior safe on public hosts).

## Deploy

### Docker Compose (from repo root)

```bash
NEXT_PUBLIC_SELFHOSTED_SERVER=1 npm run build
docker compose -f selfhosted/docker-compose.yml build
docker compose -f selfhosted/docker-compose.yml up
```

Adjust build args in `selfhosted/Dockerfile` if you need `NEXT_PUBLIC_BASE_PATH`.

### Daemon-style (pm2, systemd, etc.)

1. `NEXT_PUBLIC_SELFHOSTED_SERVER=1 npm run build`
2. Run `npm run selfhosted:start` with working directory at the repo root.
3. Set `DATABASE_PATH` if you want the SQLite file outside the default `./data/artifacts.sqlite`.
4. Set `STATIC_ROOT` if `out/` lives elsewhere.
5. Set `PORT` and `NEXT_PUBLIC_BASE_PATH` to match how users reach the app.

## API (same origin as the viewer)

Base path mirrors `NEXT_PUBLIC_BASE_PATH` (empty at domain root).

- `POST /api/artifacts` — JSON `{ "payload": "<agent-render=v1....>" }` → `{ id, createdAt, expiresAt }`
- `GET /api/artifacts/:id` — returns `{ id, payload, expiresAt, ... }` and **extends** `expiresAt` by 24h on success
- `PUT /api/artifacts/:id` — JSON `{ "payload": "..." }` replaces payload and resets sliding window
- `DELETE /api/artifacts/:id` — removes the row

Share viewer links: `https://your-host/<uuid>/` (trailing slash matches the static export layout).

## TTL semantics

- Rows expire `24h` after the last **successful** `GET /api/artifacts/:id` (or after create/update refresh).
- In deployments that terminate TLS or auth **in front** of Node, only requests that reach the app count—configure your proxy so authorized users trigger successful GETs.
- Expired rows behave like missing (`404` with `{ "error": "expired" }`).

## Cleanup

- Lazy deletion happens on read for expired rows.
- Run `npm run selfhosted:cleanup` (cron-friendly) to purge expired IDs in batch.
- Agents or operators can also `DELETE` known IDs or run SQL maintenance against the SQLite file.

## Perimeter protection (recommended, not built-in)

The server does **not** ship mandatory auth. Practical patterns:

- bind to `127.0.0.1` and rely on same-machine agents
- private network + firewall
- reverse proxy with SSO, mTLS, or API tokens
- **Cloudflare Tunnel** to expose privately, optionally **Cloudflare Zero Trust** access policies in front of the tunnel hostname

Stay neutral: public exposure is possible if you choose it; document the tradeoffs for your team.

## Agent workflow sketch

1. Encode a normal envelope to the fragment body string (same helpers as fragment mode).
2. `POST` that string as `payload`.
3. Return `https://<host>/<id>/` to the user.
4. Optionally `DELETE` when no longer needed.

## Local same-machine pattern

Run the self-hosted server on `127.0.0.1`, point agents at `http://127.0.0.1:PORT`, and keep the SQLite file on disk you control. This avoids exposing artifacts to the public internet while preserving UUID ergonomics.

## Docs

See `docs/deployment.md` for full deployment notes and environment variables.
