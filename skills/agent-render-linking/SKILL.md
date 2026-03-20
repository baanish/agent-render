---
name: agent-render-linking
description: Create fragment-first zero-retention agent-render links for markdown, code, diffs, CSV, or JSON artifacts. Use when an agent needs to share a nicely rendered artifact in the browser instead of pasting raw content into chat. Prefer this skill when the content can fit in a fragment and the operator wants the host to stay out of the payload. If fragment limits, chat-link mangling, or private server-backed workflows are the main concern, pair or switch to the selfhosted-agent-render skill.
---

# Agent Render Linking

Create browser links for artifacts rendered by `agent-render.com` or another static fragment deployment.

## When to use this skill

Prefer this skill when:

- the payload can reasonably fit in a fragment
- zero-retention-by-host behavior matters
- the user wants the simplest shareable link with no backend
- the deployment target is static hosting such as Cloudflare Pages

Prefer **selfhosted-agent-render** instead when:

- the payload is too large or fragile for fragment transport on the target surface
- the user wants short UUID links like `https://host/{uuid}`
- the operator already has a private or same-machine service available

## Core rule

Keep the artifact content in the URL fragment, not in normal query params.

Use this fragment shape:

```text
#agent-render=v1.<codec>.<payload>
#agent-render=v1.arx.<dictVersion>.<payload>
```

Supported codecs:

- `plain`: base64url-encoded JSON envelope
- `lz`: `lz-string` compressed JSON encoded for URL-safe transport
- `deflate`: deflate-compressed UTF-8 JSON bytes encoded as base64url
- `arx`: domain-dictionary substitution + brotli + binary-to-text encoding; prefer the product encoder’s automatic selection
- packed wire mode (`p: 1`) may be used automatically to shorten transport keys

Prefer:

1. shortest valid fragment for the target surface
2. codec priority `arx -> deflate -> lz -> plain` unless explicitly overridden
3. packed wire mode when available

## Envelope shape

Use this JSON envelope:

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
      "title": "Weekly report",
      "filename": "weekly-report.md",
      "content": "# Report"
    }
  ]
}
```

## Supported artifact kinds

- `markdown`
- `code`
- `diff`
- `csv`
- `json`

Use real unified git patches for diffs when possible. Set `activeArtifactId` to the artifact that should open first.

## Link construction

Construct the final URL as:

```text
https://agent-render.com/#agent-render=v1.<codec>.<payload>
https://agent-render.com/#agent-render=v1.arx.<dictVersion>.<payload>
```

For self-hosted static deployments, replace the hostname but keep the same fragment contract.

## Practical limits

Respect these limits:

- target fragment budget: about 8,000 characters
- target decoded payload budget: about 200,000 characters
- strict Discord practical budget for linked-text workflows: about 1,500 characters

If a link is getting too large:

1. try `arx` first, then `deflate`, then `lz`, then `plain`
2. allow packed wire mode
3. trim unnecessary prose or metadata
4. prefer a focused artifact over a bloated one
5. switch to the **selfhosted-agent-render** workflow when the operator accepts server-backed UUID links

## Formatting links in chat

Use platform-specific link text only on surfaces that support it cleanly.

### Discord

```md
[Short summary](https://agent-render.com/#agent-render=...)
```

### Telegram

```html
<a href="https://agent-render.com/#agent-render=...">Short summary</a>
```

### Slack

```text
<https://agent-render.com/#agent-render=...|Short summary>
```

### Other chat surfaces

If inline link text is unreliable, send a short explanation plus the raw URL.

## Zero-retention reminder

Fragment mode keeps payload contents out of the initial request to the host, but data can still leak through:

- copied URLs
- browser history
- screenshots
- any client-side analytics on the page

Do not overclaim privacy.
