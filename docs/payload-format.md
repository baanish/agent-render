# Payload Format

## Goals

The project uses a fragment-based payload so the raw artifact content stays in the browser and is not sent to the server during the request.

## Fragment shape

```text
#agent-render=v1.<codec>.<payload>    (plain | lz | deflate)
#agent-render=v1.arx.<dictVersion>.<payload>    (arx)
```

The fragment protocol includes version and codec in the outer format so unsupported formats fail cleanly.

Supported codecs:

- `plain` - base64url-encoded JSON
- `lz` - `lz-string` compressed JSON encoded for URL-safe transport
- `deflate` - deflate-compressed UTF-8 JSON bytes encoded as base64url
- `arx` - domain-dictionary substitution + brotli (quality 11) + binary-to-text encoding. arx fragments include dictionary version metadata in the outer format (`v1.arx.<dictVersion>.<payload>`) so links stay portable across dictionary updates. Four wire shapes are tried and the shortest **transport** size wins (see `computeTransportLength` in `fragment.ts` — non-ASCII Unicode may count longer after percent-encoding): **base76** (ASCII-only, 77 fragment-safe chars), **base64url** (standard RFC 4648 alphabet `A-Za-z0-9-_`, no padding, prefixed with `B.` for detection), **base1k** (Unicode, 1774 chars from U+00A1–U+07FF), and **baseBMP** (high-density Unicode, ~62k safe BMP code points from U+00A1–U+FFEF, ~15.92 bits/char). BaseBMP produces ~32% fewer characters than base1k and ~55% fewer than base76 for the same compressed bytes. BaseBMP payloads are prefixed with a U+FFF0 marker for detection. The viewer’s `arxDecompress` auto-detects the wire shape (including the rare case where a base76 length prefix is also `B.` — it tries base64url first and falls back to base76 if Brotli fails). The substitution dictionary is served at `/arx-dictionary.json` (with a pre-compressed `/arx-dictionary.json.br` variant) so agents can fetch it for local compression.

The encoder now also supports a packed wire representation (`p: 1`) that shortens key names before compression. Packed mode is transport-only; decoded envelopes normalize back to the standard shape.

Fragment payloads are the trusted direct-sharing transport. For public posts, broad group sharing, social surfaces, or corporate proxy/link-scanning environments, prefer self-hosted UUID links so the visible URL is short and stable.

## Envelope

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

Packed wire envelopes are also valid on the wire:

```json
{
  "p": 1,
  "v": 1,
  "c": "deflate",
  "t": "Artifact bundle title",
  "a": "artifact-1",
  "r": [
    {
      "i": "artifact-1",
      "k": "markdown",
      "f": "weekly-report.md",
      "c": "# Report"
    }
  ]
}
```

Packed key map:

- envelope: `codec -> c`, `title -> t`, `activeArtifactId -> a`, `artifacts -> r`
- artifact: `id -> i`, `kind -> k`, `title -> t`, `filename -> f`, `content -> c`, `language -> l`, `patch -> p`, `oldContent -> o`, `newContent -> n`, `view -> w`

## Required support

- `kind`
- optional `title`
- optional `filename`
- `content` for markdown, code, csv, and json
- `patch` or `oldContent` plus `newContent` for diffs

## Limits

- Supported fragment budget: 8,192 characters
- Supported decoded payload budget: 200,000 characters
- Larger payloads should fail with a clear error before rendering
- Compression is selected automatically by shortest fragment across packed/non-packed candidates
- Default sync codec priority is `deflate -> lz -> plain`
- Default async codec priority is `arx -> deflate -> lz -> plain`
- Optional budget-aware encoding can target strict limits like 1,500 chars and returns the shortest fragment when none fit

When a payload does not fit the fragment budget or the target surface is hostile to long URLs, use UUID mode instead of weakening the fragment protocol. Current UUID mode stores the encoded payload server-side and is not zero-retention.

### AGENTS.md POC benchmark

Running `npm run codec:poc` (single markdown artifact containing `AGENTS.md`) currently yields:

- `plain`: ~10,737 chars
- `plain+packed`: ~10,676 chars
- `lz`: ~5,703 chars
- `lz+packed`: ~5,674 chars
- `deflate`: ~4,392 chars
- `deflate+packed`: ~4,375 chars
- `arx` (base76): ~3,336 chars
- `arx` (base64url): ~3,485 chars
- `arx` (base1k): ~1,938 chars
- `arx` (baseBMP): ~1,316 chars (best raw char count)

Result: `arx` with baseBMP encoding achieves ~69% smaller fragments than `deflate` on this payload (~6.1x compression ratio). The improvement comes from brotli compression (~20% better than deflate), baseBMP encoding (~15.92 bits/char using ~62k safe BMP code points), and domain dictionary substitution. **base64url** is an ASCII-only option that can beat base76 on surfaces that percent-encode Unicode (chat apps, some shorteners). Base1k, baseBMP, and base76 remain available; auto-selection compares estimated transport length.

Timing (AGENTS.md 8192 chars, avg of 10 runs):
- `deflate+base64url`: ~0.1ms
- `arx+base76`: ~13.8ms
- `arx+base64url`: ~8.1ms
- `arx+base1k`: ~12.0ms
- `arx+baseBMP`: ~10.8ms

## Active artifact behavior

The envelope can carry multiple artifacts. The shell uses `activeArtifactId` to decide which artifact opens first, and switching artifacts updates the fragment so the shared link stays truthful.

Internal viewer navigation, such as moving between files inside a multi-file diff, does not mutate the fragment. The fragment is reserved for payload transport and bundle-level state only.

## Examples

Two sample envelopes live in `src/lib/payload/examples.ts` for local development and documentation.

### Markdown artifact example

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Maintainer kickoff",
  "activeArtifactId": "roadmap",
  "artifacts": [
    {
      "id": "roadmap",
      "kind": "markdown",
      "title": "Sprint roadmap",
      "filename": "roadmap.md",
      "content": "# Sprint roadmap\n\n- Render markdown directly in the viewer"
    }
  ]
}
```

Markdown artifacts use the `content` field and currently support client-side clipboard copy, file download, and browser print-to-PDF from the viewer shell. Mermaid fenced code blocks (` ```mermaid `) within markdown content are rendered as interactive diagrams.

### Code artifact example

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Viewer bootstrap",
  "activeArtifactId": "viewer-shell",
  "artifacts": [
    {
      "id": "viewer-shell",
      "kind": "code",
      "title": "viewer-shell.tsx",
      "filename": "viewer-shell.tsx",
      "language": "tsx",
      "content": "export function ViewerShell() {\n  return <main />;\n}"
    }
  ]
}
```

Code artifacts use the same `content` transport, plus optional `language` and `filename` hints for syntax-aware rendering, download naming, and clipboard copy of the source text.

### Diff artifact example

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Patch review",
  "activeArtifactId": "patch",
  "artifacts": [
    {
      "id": "patch",
      "kind": "diff",
      "title": "hello.ts diff",
      "filename": "hello.patch",
      "patch": "diff --git a/hello.ts b/hello.ts\n--- a/hello.ts\n+++ b/hello.ts\n@@ -1 +1 @@\n-console.log('hello')\n+console.log('hello, world')\n",
      "view": "split"
    }
  ]
}
```

Real diff artifacts can contain multiple `diff --git` sections inside one `patch` string. The viewer parses that unified patch into a sequence of file diffs and preserves per-file boundaries.

### CSV artifact example

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Metrics snapshot",
  "activeArtifactId": "metrics",
  "artifacts": [
    {
      "id": "metrics",
      "kind": "csv",
      "filename": "metrics.csv",
      "content": "artifact,kind,summary\nroadmap,markdown,launch-ready"
    }
  ]
}
```

### JSON artifact example

```json
{
  "v": 1,
  "codec": "plain",
  "title": "Artifact manifest",
  "activeArtifactId": "manifest",
  "artifacts": [
    {
      "id": "manifest",
      "kind": "json",
      "filename": "manifest.json",
      "content": "{\n  \"ready\": true\n}"
    }
  ]
}
```

Malformed JSON should still use `kind: "json"`; the viewer will show the parse error and a raw fallback instead of crashing.
