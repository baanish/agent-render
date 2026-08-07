# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Primary: an AI agent / CLI emitting an `agent-render` link (auto-generated) so a human reader can open it in a browser and reliably read rich output (markdown, code, diff, csv, json) on chat surfaces that render rich content poorly (Discord, Slack, GitHub comments, email)
- Secondary: a human creating a link by hand via the on-page "Create a link" form, usually when they want to hand-share a snippet/spec/brief without uploading it anywhere
- Constraint on both: the viewer must be **read-only, trustworthy, and instantly scannable** — no editing, no sign-in, no server round-trip of the artifact body

## Product Purpose

A zero-retention, fully static artifact viewer for AI-generated output. Everything needed to render the artifact lives in the URL fragment, decodable purely client-side: the host sees nothing in the request path, and the reader gets one stable link that reads on any surface.

Success = a reader opens a link from chat and immediately reads the artifact at full fidelity (syntax-highlighted code, real diffs, markdown, tables, structured JSON) without the link being mangled by chat's own formatting, and without the artifact ever touching server storage.

## Positioning

**Read-only rich rendering, delivered entirely client-side from a fragment payload.** The product is the *viewer*, not the upload — comparable to GitHub Gist but with the payload inlined in the URL fragment and no server-side persistence, versus Pastebin-style services that store content. Diff/markdown/code rendering match a code-review surface, not a chat bubble.

## Operating Context

- Links are pasted into places with hard constraints: Discord markdown (≤2000 chars for `[label](url)`), Slack, GitHub issues/comments, terminal outputs
- Rendering happens inside a static-exported client shell; no backend on the core viewing path (optional `selfhosted/` UUID mode exists for explicit persistence opt-in)
- Heavy renderers (CodeMirror, mermaid, git-patch diff, csv, json tree) are dynamically imported to keep the shell light
- Surfaces: desktop browsers for reading + link creation; mobile browsers for consumption of shared links (reading must be tight on mobile; creation is primarily desktop)

## Capabilities and Constraints

- Artifact kinds: markdown, code, diff, csv, json — nothing else
- Codecs: plain, lz, deflate, arx, arx2, arx3, arx4 (compact `#<tag><payload>` form emitted; legacy `agent-render=v1...` still decodable)
- Budgets: fragment ≤ 8192 chars; decoded payload ≤ 200000 chars; Discord markdown link warning when `[label](url)` > 2000
- Markdown renders sanitized GFM, mermaid fences interactive; markdown code fences reuse the CodeMirror highlighter (no second highlighting stack)
- Diff: real unified git `patch` preferred, `oldContent`+`newContent` fallback, `view` unified|split
- Security posture: untrusted input, no `dangerouslySetInnerHTML`, sanitization on markdown, fail-closed on malformed/oversized payloads pre-mount
- Product design red lines: no server persistence on the core path, no auth wall for viewing, no normal query-param transport, no database requirement for the static export

## Brand Commitments

- Name: `agent-render`
- Voice: terse, technical, honest; claims are exact (zero-retention is a host-design truth, not a privacy-anonymity promise)
- Product is open source and self-hostable; links + labels must not overstate safety ("links can still leak")
- Current mark is a placeholder; new logo/favicon being designed

## Evidence on Hand

- `docs/architecture.md`, `docs/payload-format.md`, `docs/deployment.md`, `docs/dependency-notes.md`, `docs/testing.md` describe the current protocol
- `skills/agent-render-linking/SKILL.md` and `skills/selfhosted-agent-render/SKILL.md` define the external linking and self-hosting contracts
- `AGENTS.md` records project identity, payload contract, shipped behaviors, and dev commands
- Screenshots of the current UI captured in this session (criticisms #1–16) reference every visible surface: home hero, link creator, fragment inspector, artifact toolbar, diff renderer, code renderer, csv, json, mobile markdown view, footer, wordmark

## Product Principles

1. **Client-side only, fragment-first.** The payload never travels as a request parameter and the shell stays a static export.
2. **Read-only by design.** The viewer never edits, never writes back; every toolbar action is export (copy / download / print-to-PDF for markdown).
3. **Every artifact kind is a first-class renderer.** Markdown/CodeMirror/code fences/diff/csv/json get full-fidelity displays, not degraded previews.
4. **Honest privacy.** Say what's true: zero-retention by host design. Never market as "secret-safe" beyond that.
5. **Compression when it earns it.** Compact codec tags (p/l/d/a/b/c/e) and arx-family dictionary compression exist to keep links chat-postable; plain+deflate remain the baseline.

## Accessibility & Inclusion

- Keyboard-reachable link creation and artifact navigation; `activeArtifactId` must be transformable into focus state for assistive tech
- Print output for markdown must be readable (browser print-to-PDF), with print styles that strip interactive chrome
- Color systems must pass WCAG contrast for text against the (dark, likely) surface palette — the kicker pattern's light-gray small text on dark near-background is a known contrast risk to fix in the redesign
