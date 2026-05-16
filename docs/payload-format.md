# Payload Format

## Goals

The project uses a fragment-based payload so the raw artifact content stays in the browser and is not sent to the server during the request.

Payload contents are untrusted user content. Viewers, agents, and automations should render them as data, not treat artifact text as instructions, unless the artifact source is separately trusted.

## Fragment shape

```text
#agent-render=v1.<codec>.<payload>    (plain | lz | deflate)
#agent-render=v1.arx.<dictVersion>.<payload>    (arx)
#agent-render=v1.arx2.<dictVersion>.<payload>   (arx2)
#agent-render=v1.arx3.<dictVersion>.<payload>   (arx3)
```

The fragment protocol includes version and codec in the outer format so unsupported formats fail cleanly. Fragment URLs can look long because they carry the artifact payload in the browser-only fragment instead of sending it to the host during the page request.

Supported codecs:

- `plain` - base64url-encoded JSON
- `lz` - `lz-string` compressed JSON encoded for URL-safe transport
- `deflate` - deflate-compressed UTF-8 JSON bytes encoded as base64url
- `arx` - domain-dictionary substitution + brotli (quality 11) + binary-to-text encoding. arx fragments include dictionary version metadata in the outer format (`v1.arx.<dictVersion>.<payload>`) so links stay portable across dictionary updates. Four wire shapes are tried and the shortest **transport** size wins (see `computeTransportLength` in `fragment.ts` — non-ASCII Unicode may count longer after percent-encoding): **base76** (ASCII-only, 77 fragment-safe chars), **base64url** (standard RFC 4648 alphabet `A-Za-z0-9-_`, no padding, prefixed with `B.` for detection), **base1k** (Unicode, 1774 chars from U+00A1–U+07FF), and **baseBMP** (high-density Unicode, ~62k safe BMP code points from U+00A1–U+FFEF, ~15.92 bits/char). BaseBMP produces ~32% fewer characters than base1k and ~55% fewer than base76 for the same compressed bytes. BaseBMP payloads are prefixed with a U+FFF0 marker for detection. The viewer’s `arxDecompress` auto-detects the wire shape (including the rare case where a base76 length prefix is also `B.` — it tries base64url first and falls back to base76 if Brotli fails). The substitution dictionary is served at `/arx-dictionary.json` with a pre-compressed `/arx-dictionary.json.br` variant; the viewer tries the `.br` file first on default loads and falls back to JSON. The arx2 overlay dictionary follows the same `.br`-then-JSON default load pattern.
- `arx2` - tuple-envelope transport + arx2 overlay substitution + the shared arx dictionary + brotli (quality 11) + the same four binary-to-text wire shapes. arx2 fragments use `v1.arx2.<dictVersion>.<payload>`, where `dictVersion` is the shared arx dictionary version. Existing `arx` links remain valid; async auto-selection keeps arx2 as the conservative transport-measured tuple codec.
- `arx3` - the same tuple envelope, overlay substitution, shared arx dictionary, and brotli bytes as arx2, with a different selection rule: baseBMP may win by decoded visible character length instead of conservative percent-encoded transport length. This is the compact visible URL mode for trusted surfaces that preserve Unicode fragments. If a platform rewrites, truncates, or previews links aggressively, prefer arx2/base64url or UUID mode instead.

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

arx2 uses a tuple wire envelope instead of JSON object keys:

- single artifact: `[3, artifactTuple, envelopeTitle?]`
- multi-artifact bundle: `[2, [artifactTuple, ...], envelopeTitle?, activeIndex?]`
- artifact tuples use kind codes: `m` markdown, `c` code, `d` diff, `s` csv, `j` json
- trailing optional fields are trimmed; omitted optional slots before later values are encoded as `null`

Tuple fields:

- markdown/csv/json: `[kindCode, id, content, title?, filename?]`
- code: `["c", id, content, language?, title?, filename?]`
- diff: `["d", id, patch?, oldContent?, newContent?, language?, view?, title?, filename?]`

## Required support

- `kind`
- optional `title`
- optional `filename`
- `content` for markdown, code, csv, and json
- `patch` or `oldContent` plus `newContent` for diffs

## Limits

- Supported fragment budget: 8,192 decoded visible fragment characters
- Supported decoded payload budget: 200,000 characters
- Larger payloads should fail with a clear error before rendering
- Compression is selected automatically across packed/non-packed candidates; arx and arx2 optimize conservative transport length, while arx3 optimizes compact visible length for its dense Unicode wire
- Default sync codec priority is `deflate -> lz -> plain`
- Default async codec priority is `arx3 -> arx2 -> arx -> deflate -> lz -> plain`
- Optional budget-aware encoding can target strict limits like 1,500 chars and returns the shortest fragment when none fit

When a payload does not fit the fragment budget or the target surface is hostile to long URLs, use UUID mode instead of weakening the fragment protocol. Current UUID mode stores the encoded payload server-side and is not zero-retention.

### Codec benchmark

Running `npm run bench:codecs` checks a fixed corpus across markdown, a real code-bench report, code, diff, CSV, JSON, and multi-artifact bundles. The current committed baseline shows:

- total `arx`: 5,544 brotli bytes
- total `arx2`: 5,410 brotli bytes
- total `arx3`: 5,410 brotli bytes
- `arx2` delta: 2.42% smaller overall
- `arx3` visible delta vs arx2: 60.48% fewer visible fragment characters
- real code-bench report row: arx2 is 2,984 visible fragment characters; arx3 is 1,142

The gate fails if arx2 is less than 0.5% smaller overall, if arx3 is less than 35% smaller by visible characters overall, or if any individual corpus row regresses by more than 0.5%. Use `npm run bench:codecs:update` only when intentionally refreshing the committed baseline.

## Active artifact behavior

The envelope can carry multiple artifacts. The shell uses `activeArtifactId` to decide which artifact opens first, and switching artifacts updates the fragment so the shared link stays truthful.

Internal viewer navigation, such as moving between files inside a multi-file diff, does not mutate the fragment. The fragment is reserved for payload transport and bundle-level state only.

## Examples

Sample envelopes live in `src/lib/payload/examples.ts` for local development and documentation. The homepage uses precomputed sample link data that is checked against those generated examples in tests, keeping the large sample strings out of the initial shell chunk.

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
