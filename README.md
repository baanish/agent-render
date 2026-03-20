# agent-render

`agent-render` is a fragment-first artifact viewer for AI-generated outputs.

The main product remains the shipped static, zero-retention viewer: it renders markdown, code, diffs, CSV, and JSON directly from the URL fragment so the host does not receive the artifact body during the initial request.

This repo now also includes an **optional self-hosted mode** for power users and agent workflows. That add-on stores the existing `agent-render` payload string in SQLite under a UUID v4 and serves links like `https://host/{uuid}` while reusing the same viewer UI.

## Modes

### 1. Static fragment mode (main/default)

- fully static export
- zero-retention by host design
- no backend required
- payload lives in `#agent-render=...`
- best default for public sharing

### 2. Self-hosted UUID mode (optional add-on)

- separate server-backed deployment in the same repo
- stores the existing payload string as-is in SQLite
- serves `/{uuid}` viewer links
- 24-hour sliding TTL
- intended for local agents, private deployments, or links that are too large or awkward for fragments alone

The static fragment app is still the primary product. Self-hosted mode is an extra deployment option, not a replacement.

## OpenClaw

`agent-render` was built to make OpenClaw agents better at sharing artifacts across chat surfaces that render markdown, diffs, and structured data poorly.

- Website: `https://agent-render.com`
- OpenClaw: `https://openclaw.ai`
- ClawdHub skill: `https://clawdhub.com/skills/agent-render-linking`

## Status

- Markdown, code, diff, CSV, and JSON all render in the shared viewer shell
- Fragment transport supports `plain`, `lz`, `deflate`, and `arx`, with automatic shortest-fragment selection across packed/non-packed wire formats
- The `arx` substitution dictionary is served at `/arx-dictionary.json` so agents can fetch it for local compression
- The viewer toolbar copies artifact bodies to the clipboard, downloads them as files, and supports browser print-to-PDF for markdown
- Static deployment target: static hosting, including Cloudflare Pages
- Optional self-hosted deployment target: Node.js service + SQLite

## Included Renderers

- `markdown` - GFM rendering with safe sanitization, copy/download/print flows from the shell, and premium code fences that reuse the CodeMirror viewer stack
- `code` - read-only CodeMirror view with line numbers, wrap toggle, syntax-tree-aware rainbow brackets, and maintained indentation markers
- `diff` - review-style multi-file git patch viewer with unified and split modes
- `csv` - parsed table view with sticky headers and horizontal overflow handling
- `json` - lightweight read-only tree view plus raw code view, with graceful malformed JSON fallback

## Principles

### Static fragment mode

- Fully static export with Next.js App Router
- No backend, no database, no server-side persistence
- Fragment-based payloads (`#...`) so the server never receives artifact contents
- Public-safe naming and MIT-compatible dependencies

### Optional self-hosted mode

- Reuse the same viewer/renderers instead of introducing a second frontend
- Store the existing payload string without inventing a second artifact schema
- Keep server storage simple: SQLite, UUID v4 ids, create/read/delete, optional update
- Treat self-hosted mode as practical infrastructure for private or oversized sharing, not as a replacement for fragment links

## Local Development

```bash
npm install
npm run dev
```

## Static Local Preview

For the export-first runtime story:

```bash
npm run build
npm run preview
```

Set `NEXT_PUBLIC_BASE_PATH` before `npm run build` when you want to preview a subpath deployment locally.

## Self-hosted Local Run

Build the shared viewer export, then start the optional SQLite-backed server:

```bash
npm run build
npm run start:selfhosted
```

Useful environment variables:

- `PORT` - HTTP port for the self-hosted service
- `HOST` - bind host, default `0.0.0.0`
- `AGENT_RENDER_DB_PATH` - SQLite file path, default `.data/agent-render-selfhosted.sqlite`
- `AGENT_RENDER_PUBLIC_ORIGIN` - external origin used when the API returns canonical UUID links

Cleanup expired rows manually when desired:

```bash
npm run cleanup:selfhosted
```

## Self-hosted API

The optional server-backed mode stores the existing payload string and exposes a simple JSON API:

- `POST /api/artifacts` - create a new stored payload
- `GET /api/artifacts/:id` - fetch and refresh TTL
- `PUT /api/artifacts/:id` - replace a stored payload and reset TTL
- `DELETE /api/artifacts/:id` - delete a stored payload
- `GET /:id` - render the stored payload through the shared viewer shell

Request body for create/update:

```json
{
  "payload": "agent-render=v1.deflate.<payload>"
}
```

Stored payloads use a **24-hour sliding TTL**. Every successful read extends `expires_at` by another 24 hours. Expired rows fail clearly and are removed lazily on access or via the cleanup command.

## Deployment Notes

### Static mode

Deploy the generated `out/` directory to any static host.

### Self-hosted mode

Run `npm run build` first so the server can reuse the exported viewer assets from `out/`, then run `npm run start:selfhosted` behind whichever perimeter protection you prefer.

Reasonable patterns:

- same machine as the agent for local/private use
- Docker Compose with a mounted SQLite volume
- systemd or pm2-style process supervision
- Cloudflare Tunnel or another reverse proxy in front of the service
- optional Zero Trust or basic auth at the perimeter

Public exposure is possible if you want it, but it is not required by the app.

## Contributing

- Public exported functions/components in `src/lib/**` and `src/components/**` must have a preceding `/** ... */` JSDoc block.
- Internal helpers are intentionally excluded from this rule to keep documentation noise low.
- Run `npm run check:public-export-docs` (included in `npm run lint` and `npm run check`) before opening a PR.

## Verification

```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

The home page includes sample fragment presets for every artifact type, including a malformed JSON case for error handling.

The fragment examples are encoded with the same transport used by the app, so larger samples naturally switch to the shortest available transport.

## Bundle Notes

The shell keeps first load lean and defers renderer-heavy code until needed. The remaining largest deferred dependency is the diff stack, which stays because it still delivers the strongest review-style unified/split UX for real git patches.

## Docs

- `docs/architecture.md` - architecture and tradeoffs
- `docs/payload-format.md` - fragment protocol, limits, and examples
- `docs/deployment.md` - deployment notes for both modes
- `docs/dependency-notes.md` - major dependency and license notes
- `docs/testing.md` - test commands, screenshot workflow, and CI notes
- `skills/agent-render-linking/SKILL.md` - fragment-first linking guidance
- `skills/selfhosted-agent-render/SKILL.md` - self-hosted UUID mode guidance

## Zero Retention

In static fragment mode, `Zero Data Retention by design` means the deployed host does not receive artifact contents as part of the initial request.

That does **not** mean the data disappears from browser history, copied links, screenshots, or any client-side analytics you add later.

Self-hosted UUID mode is different: it intentionally stores payload strings in SQLite for a limited time. Use it when that tradeoff is acceptable or desirable.

## License

MIT
