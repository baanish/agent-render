---
name: selfhosted-agent-render
description: Build fragment-based Agent Render links for a self-hosted static deployment. Covers envelope shape, codecs, per-artifact-kind field requirements (diff uses patch or oldContent+newContent, not content), and fetching the arx dictionary from your own host. Use when the viewer base URL is not agent-render.com—for example a private or corporate static host—or when the user explicitly self-hosts agent-render.
---

# Self-hosted Agent Render

Construct `#agent-render=...` links against **your own** static deployment of [agent-render](https://github.com/baanish/agent-render), not `agent-render.com`.

## Project context

Agent Render is a fully static, zero-retention artifact viewer. The same fragment protocol and envelope format apply whether the app is hosted publicly or on your own origin.

Throughout this skill, replace `<origin>` with your deployment base (scheme + host, no trailing slash), for example `https://render.example.com` or `https://pages.example.com/my-app` when using a subpath (set `NEXT_PUBLIC_BASE_PATH` at build time for subpath deployments).

## Core rule

Keep artifact bodies in the URL **fragment**, not in normal query parameters.

Fragment shape:

```text
#agent-render=v1.<codec>.<payload>                (plain | lz | deflate)
#agent-render=v1.arx.<dictVersion>.<payload>       (arx)
```

Supported codecs match the public product: `plain`, `lz`, `deflate`, `arx`, plus optional packed wire mode (`p: 1`) for shorter keys. Prefer shortest valid transport for the target surface; codec priority is typically `arx → deflate → lz → plain` unless overridden.

## Envelope format

The viewer expects a JSON envelope with (at least) `v`, `codec`, `title`, `activeArtifactId`, and `artifacts`. Each artifact must include `id`, `kind`, and fields that match its `kind` (see below).

Example envelope (one artifact):

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

## Multi-artifact bundles

You may include several artifacts; `activeArtifactId` selects which tab opens first. Invalid `activeArtifactId` values normalize to the first artifact.

## Link construction

Build the shareable URL as:

```text
<origin>/#agent-render=v1.<codec>.<payload>                (plain | lz | deflate)
<origin>/#agent-render=v1.arx.<dictVersion>.<payload>       (arx)
```

Encoding steps for `plain`, `lz`, `deflate`, and `arx` match the public product; see `skills/agent-render-linking/SKILL.md` for full step-by-step construction and chat-specific link formatting.

## Shared arx dictionary (self-hosted)

Fetch the dictionary from **your** deployment so substitution versions stay aligned with the viewer:

- `<origin>/arx-dictionary.json`
- `<origin>/arx-dictionary.json.br` (optional brotli-compressed variant)

If local `arx` encoding fails (for example dictionary fetch errors), fall back to `deflate` or another codec.

## Practical limits

- Fragment budget: about 8,192 characters
- Decoded payload budget: about 200,000 characters

If the fragment is too large, try `arx`, then `deflate`, then `lz`, then `plain`, allow packed wire mode, and trim content before failing explicitly.

## Avoid

- Do not put raw artifact bodies in normal query params.
- Do not assume every `kind` uses `content`; **diff** does not.
- Do not invent unsupported artifact kinds or fields beyond what the shipped viewer accepts.
