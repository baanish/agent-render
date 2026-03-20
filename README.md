# agent-render

`agent-render` is a fully static, zero-retention artifact viewer for AI-generated outputs (with an **optional** self-hosted UUID mode for agents who need server-backed links).

Built for the OpenClaw ecosystem, `agent-render` focuses on fragment-based sharing for markdown, code, diffs, CSV, and JSON so the payload stays in the browser URL fragment instead of being sent to a server on the default static path.

## OpenClaw

`agent-render` was built to make OpenClaw agents better at sharing artifacts across chat surfaces that render markdown, diffs, and structured data poorly.

- Website: `https://agent-render.com`
- OpenClaw: `https://openclaw.ai`
- ClawdHub skill: `https://clawdhub.com/skills/agent-render-linking`

## Status

- Markdown, code, diff, CSV, and JSON all render in the static shell
- Fragment transport supports `plain`, `lz`, `deflate`, and `arx`, with automatic shortest-fragment selection across packed/non-packed wire formats
- The `arx` substitution dictionary is served at `/arx-dictionary.json` so agents can fetch it for local compression
- The viewer toolbar copies artifact bodies to the clipboard, downloads them as files, and (for markdown) supports browser print-to-PDF
- Deployment target: static hosting, including Cloudflare Pages

## Included Renderers

- `markdown` - GFM rendering with safe sanitization, copy/download/print flows from the shell, and premium code fences that reuse the CodeMirror viewer stack
- `code` - read-only CodeMirror view with line numbers, wrap toggle, syntax-tree-aware rainbow brackets, and maintained indentation markers
- `diff` - review-style multi-file git patch viewer with unified and split modes
- `csv` - parsed table view with sticky headers and horizontal overflow handling
- `json` - lightweight read-only tree view plus raw code view, with graceful malformed JSON fallback

## Principles

- Fully static export with Next.js App Router for the **default** product
- No backend, no database, and no server-side persistence on the **static** path
- Fragment-based payloads (`#...`) so the static host never receives artifact contents during the page request
- Optional **self-hosted** UUID + SQLite mode for agents (separate Node server in `selfhosted/`; see `docs/deployment.md`)
- Public-safe naming and MIT-compatible dependencies

## Local Development

```bash
npm install
npm run dev
```

## Local Preview

For the real export-only runtime story:

```bash
npm run build
npm run preview
```

Set `NEXT_PUBLIC_BASE_PATH` before `npm run build` when you want to preview a subpath deployment locally.

## Optional self-hosted mode (UUID links)

Power users can run a small Node server that stores the same `agent-render=v1...` payload string in SQLite and opens it from `https://your-host/{uuid}/`. This **does not** replace the static fragment product: build with `NEXT_PUBLIC_SELFHOSTED_SERVER=1`, then `npm run selfhosted:start` after `npm run build`. Full notes live in `docs/deployment.md` and `skills/selfhosted-agent-render/SKILL.md`.

## Contributing

- Public exported functions/components in `src/lib/**` and `src/components/**` must have a preceding `/** ... */` JSDoc block.
- Internal helpers are intentionally excluded from this rule to keep documentation noise low.
- Run `npm run check:public-export-docs` (included in `npm run lint` and `npm run check`) before opening a PR.

## Verification

```bash
npm run lint
npm run typecheck
NEXT_PUBLIC_BASE_PATH=/agent-render npm run build
```

The home page includes sample fragment presets for every artifact type, including a malformed JSON case for error handling.

The fragment examples are encoded with the same transport used by the app, so larger samples naturally switch to the shortest available transport.

## Bundle Notes

The shell keeps first load lean and defers renderer-heavy code until needed. The remaining largest deferred dependency is the diff stack, which stays because it still delivers the strongest review-style unified/split UX for real git patches.

## Docs

- `docs/architecture.md` - architecture and tradeoffs
- `docs/payload-format.md` - fragment protocol, limits, and examples
- `docs/deployment.md` - deployment notes
- `docs/dependency-notes.md` - major dependency and license notes
- `docs/testing.md` - test commands, screenshot workflow, and CI notes

## Zero Retention

On the **default static deployment**, artifact contents stay in the URL fragment so the static host does not receive the payload during the page request. This improves privacy for shared artifacts, but the link still lives in browser history, copied URLs, and any client-side telemetry you add later.

`Zero Data Retention by design` in the static UI refers to that static-host boundary. The **optional self-hosted** server intentionally stores payloads in SQLite with a sliding TTL; treat that as a different deployment contract (see `docs/deployment.md`).

## License

MIT
