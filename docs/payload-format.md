# Payload Format

## Goals

The project uses a fragment-based payload format so the raw artifact content can stay out of the initial request in the main static mode.

That same payload format is also the canonical stored value in optional self-hosted mode.

## Fragment shape

```text
#agent-render=v1.<codec>.<payload>    (plain | lz | deflate)
#agent-render=v1.arx.<dictVersion>.<payload>    (arx)
```

Supported codecs:

- `plain` - base64url-encoded JSON
- `lz` - `lz-string` compressed JSON encoded for URL-safe transport
- `deflate` - deflate-compressed UTF-8 JSON bytes encoded as base64url
- `arx` - domain-dictionary substitution + brotli + binary-to-text encoding, including dictionary version metadata in the outer format

The encoder also supports packed wire transport (`p: 1`) that shortens keys before compression and expands back to the standard envelope during decode.

## Self-hosted storage shape

The optional self-hosted mode stores the existing payload string as-is, without the leading `#`.

Example stored value:

```text
agent-render=v1.deflate.<payload>
```

Or for `arx`:

```text
agent-render=v1.arx.<dictVersion>.<payload>
```

The server does **not** invent a new artifact schema. It stores the canonical transport string and feeds that same string back into the shared decode/render flow.

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

Packed wire envelopes are also valid on the wire and normalize back to the standard envelope during decode.

## Required support

Supported artifact kinds in both modes:

- `markdown`
- `code`
- `diff`
- `csv`
- `json`

Field expectations:

- `content` for markdown, code, csv, and json
- `patch` or `oldContent` plus `newContent` for diffs
- unique artifact ids within a bundle
- at least one artifact per bundle

## Limits

- Supported fragment budget: 8,000 characters
- Supported decoded payload budget: 200,000 characters
- Larger payloads should fail with a clear error before rendering
- Compression is selected automatically by shortest fragment across packed/non-packed candidates
- Default sync codec priority is `deflate -> lz -> plain`
- Default async codec priority is `arx -> deflate -> lz -> plain`

## Active artifact behavior

The envelope can carry multiple artifacts.

- in static fragment mode, switching artifacts updates `activeArtifactId` in the fragment
- in self-hosted UUID mode, switching artifacts stays in local UI state so the stored payload and UUID route remain stable

Internal diff-file navigation remains UI state in both modes.

## Retention distinction

- Static fragment mode keeps the payload out of the request path.
- Self-hosted UUID mode stores the payload string in SQLite under a UUID v4 with a 24-hour sliding TTL.

The envelope and codecs are shared. Only the transport/storage path changes.
