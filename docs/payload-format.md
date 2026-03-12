# Payload Format

## Goals

The project uses a fragment-based payload so the raw artifact content stays in the browser and is not sent to the server during the request.

## Fragment shape

```text
#agent-render=v1.<codec>.<payload>
```

The fragment protocol includes version and codec in the outer format so unsupported formats fail cleanly.

Supported codecs:

- `plain` - base64url-encoded JSON
- `lz` - `lz-string` compressed JSON encoded for URL-safe transport
- `deflate` - deflate-compressed UTF-8 JSON bytes encoded as base64url

The encoder now also supports a packed wire representation (`p: 1`) that shortens key names before compression. Packed mode is transport-only; decoded envelopes normalize back to the standard shape.

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

- Supported fragment budget: 8,000 characters
- Supported decoded payload budget: 200,000 characters
- Larger payloads should fail with a clear error before rendering
- Compression is selected automatically by shortest fragment across packed/non-packed candidates
- Default codec priority is `deflate -> lz -> plain`
- Optional budget-aware encoding can target strict limits like 1,500 chars and returns the shortest fragment when none fit

### AGENTS.md POC benchmark

Running `npm run codec:poc` (single markdown artifact containing `AGENTS.md`) currently yields:

- `plain`: 10,584 chars
- `plain+packed`: 10,522 chars
- `lz`: 5,622 chars
- `lz+packed`: 5,583 chars
- `deflate`: 4,328 chars
- `deflate+packed`: 4,312 chars (best)

Result: aggressive transport improves size materially (~23.3% vs `lz` baseline), but this payload still does not fit a 1,500-char budget.

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

Markdown artifacts use the `content` field and currently support client-side download and browser print-to-PDF from the viewer shell.

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

Code artifacts use the same `content` transport, plus optional `language` and `filename` hints for syntax-aware rendering and download naming.

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
