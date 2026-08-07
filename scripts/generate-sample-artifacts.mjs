#!/usr/bin/env node
// Generates fresh sample fragment links across all supported artifact kinds,
// exercises the app's own encoder (`createGeneratedArtifactLink`), and writes
// a clickable markdown index to `.impeccable/overnight-shots/SAMPLE_LINKS.md`.
//
// Usage:  node scripts/generate-sample-artifacts.mjs
// Requires tsx (devDependency): `npx tsx` resolves this automatically when
// invoked via `npm run generate:samples`.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGeneratedArtifactLink } from "../src/lib/payload/link-creator.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../.impeccable/overnight-shots");
const INDEX_PATH = path.join(OUTPUT_DIR, "SAMPLE_LINKS.md");
const PREVIEW_BASE = "http://127.0.0.1:4401/agent-render/";

const MARKDOWN_CONTENT = `# Maintainer kickoff — phase notes

This sample exercises the markdown renderer end-to-end: GFM tables, checklist items, inline code, a CodeMirror-backed fence, and a mermaid diagram. Every artifact kind renders without the payload ever touching the host request path.

## What's inside

- [x] Sanitized GFM rendering
- [x] CodeMirror-backed syntax fences
- [x] Interactive mermaid diagrams
- [ ] Transcript of user confirmations

## Table

| Codec  | Tag | Wire size (this brief) | Notes                    |
| ------ | --- | ---------------------: | ------------------------ |
| plain  | p   | ~1.0x                  | Baseline, no compression |
| lz     | l   | ~0.7x                  | LZ-string                |
| arx4   | e   | ~0.4x                  | Context mixer + priors   |

## Code fence

\`\`\`tsx
type Payload = { codec: string; fragment: string };

export function decodeEnvelop(fr: string): Payload {
  const [codec, ...rest] = fr.split(".");
  return { codec, fragment: rest.join(".") };
}
\`\`\`

## Diagram

\`\`\`mermaid
flowchart LR
  A[chat surface] -->|paste link| B[static host]
  B -->|serve shell only| C[browser]
  C -->|decode fragment| D[artifact rendered]
  D -.->|never sent back| B
\`\`\`

## Links and inline code

The \`/agent-render\` base path is configurable via \`NEXT_PUBLIC_BASE_PATH\`. Read the [architecture doc](https://example.com) for the transport contract.
`;

const CODE_CONTENT = `// Code renderer spot-check: a hook with a subtle memo.
import { useEffect, useRef, useState } from "react";

export function useDebouncedValue(value, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  const timerRef = useRef(0);

  useEffect(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => window.clearTimeout(timerRef.current);
  }, [value, delayMs]);

  return debounced;
}

export function useFragmentLength(hash) {
  return hash.startsWith("#") ? hash.length - 1 : 0;
}
`;

const DIFF_CONTENT = `diff --git a/src/components/viewer-shell.tsx b/src/components/viewer-shell.tsx
index 3c8e1a4..9f2b7d1 100644
--- a/src/components/viewer-shell.tsx
+++ b/src/components/viewer-shell.tsx
@@ -120,8 +120,12 @@ export function ViewerShell() {
   const [hash, setHash] = useState("");
   const envelope = parsed.ok ? parsed.envelope : null;
 
-  // Promote the inspector on error so the user sees it before the hero.
-  const showInspector = hasFragment && !activeArtifact;
+  // The inspector must be visible whenever a fragment is present, and
+  // promoted above the hero when the decode fails — the error is the point.
+  const showInspector =
+    hasFragment && !activeArtifact && (parsedOk || parsed.code !== "empty");
+  const hasFragmentError =
+    hasFragment && !parsedOk && parsed.code !== "empty";
 
   return (
     <main data-testid="viewer-shell" data-viewer-state={viewerState}>
diff --git a/src/lib/payload/fragment.ts b/src/lib/payload/fragment.ts
index a1b2c3d..e4f5g6h 100644
--- a/src/lib/payload/fragment.ts
+++ b/src/lib/payload/fragment.ts
@@ -42,7 +42,6 @@ function parseEnvelope(raw) {
   if (typeof raw !== "object" || raw === null) {
     return { ok: false, code: "invalid-shape" };
   }
-  console.debug("parsed envelope", raw);
   return normalizeEnvelope(raw);
 }
`;

const CSV_CONTENT = `artifact,kind,wire size,decode time,codec
maintainer-kickoff,markdown,1842,4ms,arx3
viewer-bootstrap,code,921,2ms,deflate
phase-1-diff,diff,1288,3ms,lz
data-export-preview,csv,654,1ms,plain
artifact-manifest,json,1104,2ms,arx4
phase-2-diff,diff,2210,5ms,arx3
release-checklist,markdown,1520,3ms,deflate
markdown-brief,markdown,1804,4ms,arx4
code-fragment,code,733,2ms,plain
phase-3-diff,diff,1997,4ms,lz
`;

const JSON_CONTENT = JSON.stringify(
  {
    schema: "agent-render/v1",
    codec: "arx4",
    fragmentBudget: 8192,
    payloadBudget: 200000,
    transport: {
      mechanism: "url-fragment",
      requestPath: false,
      queryParams: false,
    },
    renderers: [
      { kind: "markdown", surface: "sanitized-gfm", mimeTypes: ["text/markdown"] },
      { kind: "code", surface: "codemirror-readonly" },
      { kind: "diff", surface: "git-patch-review", modes: ["unified", "split"] },
      { kind: "csv", surface: "table-grid" },
      { kind: "json", surface: "tree+raw-fallback" },
    ],
    privacy: {
      zeroRetentionByHostDesign: true,
      secretSafe: false,
      linkLeakage: ["browser-history", "screenshots", "clipboard", "analytics-opt-in"],
    },
  },
  null,
  2,
);

const SAMPLES = [
  {
    draft: {
      kind: "markdown",
      title: "Maintainer kickoff — phase notes",
      filename: "phase-notes.md",
      content: MARKDOWN_CONTENT,
      language: "markdown",
      diffView: "unified",
      codec: "arx3",
    },
    description: "Long-form markdown with GFM table, checklist, fence, mermaid.",
  },
  {
    draft: {
      kind: "code",
      title: "Viewer bootstrap hooks",
      filename: "viewer-hooks.tsx",
      content: CODE_CONTENT,
      language: "tsx",
      diffView: "unified",
      codec: "deflate",
    },
    description: "TypeScript hook file rendered in read-only CodeMirror.",
  },
  {
    draft: {
      kind: "diff",
      title: "Inspector error-promotion patch",
      filename: "inspector-gate.patch",
      content: DIFF_CONTENT,
      language: "",
      diffView: "unified",
      codec: "lz",
    },
    description: "Two-file unified git patch rendered as a review-style diff.",
  },
  {
    draft: {
      kind: "csv",
      title: "Codec size manifest",
      filename: "codec-manifest.csv",
      content: CSV_CONTENT,
      language: "",
      diffView: "unified",
      codec: "plain",
    },
    description: "CSV rendered as a sticky-header table.",
  },
  {
    draft: {
      kind: "json",
      title: "Envelope schema manifest",
      filename: "schema.json",
      content: JSON_CONTENT,
      language: "",
      diffView: "unified",
      codec: "arx4",
    },
    description: "Nested JSON rendered as a collapsible tree.",
  },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const lines = [
    "# Sample fragment links",
    "",
    "Generated with `createGeneratedArtifactLink` from the app's own encoder.",
    "",
    `Preview base: \`${PREVIEW_BASE}\` (start the preview server before clicking).`,
    "",
    "| Kind | Title | Codec | Fragment | Link |",
    "| --- | --- | --- | ---: | --- |",
  ];

  for (const sample of SAMPLES) {
    const link = createGeneratedArtifactLink(sample.draft, PREVIEW_BASE);
    lines.push(
      `| ${sample.draft.kind} | ${sample.draft.title} | ${link.codec} | ${link.fragmentLength} ch | [open](${link.url}) |`,
    );
  }

  lines.push("");
  lines.push("## Notes");
  lines.push("");
  for (const sample of SAMPLES) {
    lines.push(`- **${sample.draft.title}** — ${sample.description}`);
  }
  lines.push("");

  await writeFile(INDEX_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${SAMPLES.length} sample links to ${INDEX_PATH}`);

  for (const sample of SAMPLES) {
    const link = createGeneratedArtifactLink(sample.draft, PREVIEW_BASE);
    process.stdout.write(`  ${sample.draft.kind.padEnd(8)}  ${link.fragmentLength}ch  ${sample.draft.title}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
