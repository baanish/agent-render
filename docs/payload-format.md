# Payload Format

## Goals

Phase 1 uses a fragment-based payload so the raw artifact content stays in the browser and is not sent to the server during the request.

## Fragment shape

```text
#agent-render=v1.plain.<base64url-encoded-json>
```

The fragment protocol includes version and codec in the outer format so unsupported formats fail cleanly.

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

## Required support in Phase 1

- `kind`
- optional `title`
- optional `filename`
- `content` for markdown, code, csv, and json
- `patch` or `oldContent` plus `newContent` for diffs

## Limits

- Supported fragment budget: 8,000 characters
- Larger payloads should fail with a clear error before rendering
- Compression is reserved for a future `codec` such as `lz`

## Examples

Two sample envelopes live in `src/lib/payload/examples.ts` for local development and documentation.
