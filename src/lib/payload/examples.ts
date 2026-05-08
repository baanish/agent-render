import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

export const sampleEnvelopes: PayloadEnvelope[] = [
  {
    v: 1,
    codec: "plain",
    title: "Maintainer kickoff",
    activeArtifactId: "roadmap",
    artifacts: [
      {
        id: "roadmap",
        kind: "markdown",
        title: "Sprint roadmap",
        filename: "roadmap.md",
        content:
          "# Sprint roadmap\n\n> The public shell now needs a renderer that feels like a first-class artifact, not a fallback preview.\n\n## Sprint 1 scope\n\n- [x] Render markdown directly in the viewer\n- [x] Support GitHub Flavored Markdown tables and task lists\n- [x] Keep raw HTML disabled by default\n- [x] Add markdown download and print flows\n\n## Launch checklist\n\n| Surface | Status | Notes |\n| --- | --- | --- |\n| Viewer shell | Ready | Editorial chrome stays intact |\n| Code fences | Ready | Productized framing with language chips |\n| Print output | Ready | Browser print only, no server path |\n\n### Example fenced block\n\n```ts\nexport function decodeEnvelope(fragment: string) {\n  return fragment.startsWith(\"agent-render=\") ? \"ready\" : \"missing\";\n}\n```\n\nKeep the markdown renderer crisp on mobile and intentional on paper.",
      },
    ],
  },
  {
    v: 1,
    codec: "plain",
    title: "Viewer bootstrap",
    activeArtifactId: "viewer-shell",
    artifacts: [
      {
        id: "viewer-shell",
        kind: "code",
        title: "viewer-shell.tsx",
        filename: "viewer-shell.tsx",
        language: "tsx",
        content:
          "export function ViewerShell() {\n  return <main>Fragment-powered artifact viewer shell</main>;\n}",
      },
    ],
  },
  {
    v: 1,
    codec: "plain",
    title: "Phase 1 sample diff",
    activeArtifactId: "patch",
    artifacts: [
      {
        id: "patch",
        kind: "diff",
        title: "release.patch",
        filename: "release.patch",
        patch:
          "diff --git a/src/hello.ts b/src/hello.ts\nindex 1111111..2222222 100644\n--- a/src/hello.ts\n+++ b/src/hello.ts\n@@ -1,3 +1,5 @@\n-export function greet() {\n-  return 'hello';\n+export function greet(name: string) {\n+  const target = name || 'world';\n+\n+  return `hello, ${target}`;\n }\ndiff --git a/src/version.ts b/src/version.ts\nnew file mode 100644\nindex 0000000..3333333\n--- /dev/null\n+++ b/src/version.ts\n@@ -0,0 +1 @@\n+export const version = '0.1.0';\n",
        view: "split",
      },
    ],
  },
  {
    v: 1,
    codec: "plain",
    title: "Data export preview",
    activeArtifactId: "metrics",
    artifacts: [
      {
        id: "metrics",
        kind: "csv",
        title: "Metrics snapshot",
        filename: "metrics.csv",
        content:
          'artifact,kind,summary\nroadmap,markdown,"Launch checklist, print-ready"\nviewer-shell,code,"tsx source, line-numbered"\npatch,diff,"review diff, split view"',
      },
    ],
  },
  {
    v: 1,
    codec: "plain",
    title: "arx showcase",
    activeArtifactId: "manifest",
    artifacts: [
      {
        id: "release-notes",
        kind: "markdown",
        title: "v2.0 release notes",
        filename: "RELEASE.md",
        content:
          "# agent-render v2.0 — arx2 compression\n\n> **Everything you see here is encoded in the URL fragment.** No server ever receives this content.\n\n## What is arx2?\n\narx2 is the tuple-envelope evolution of arx (Agent Render eXtreme), the multi-stage compression pipeline that squeezes structured payloads into URL-safe fragments. It combines:\n\n1. **Tuple envelope transport** — artifact metadata is serialized without repeated JSON object keys\n2. **Overlay + shared dictionary substitution** — common tuple, code, markdown, and diff patterns are replaced with short byte sequences\n3. **Brotli compression** (quality 11) — ~20% smaller than deflate\n4. **High-density binary-to-text encoding** — four wire shapes are tried and the shortest transport wins:\n\n| Encoding | Character set | Bits per character | Typical use |\n| --- | --- | --- | --- |\n| base76 | ASCII printable | 6.27 | Maximum compatibility |\n| base64url | A-Z, a-z, 0-9, - and _ | 6.00 | Chat-safe ASCII |\n| base1k | U+00A1–U+07FF | 10.79 | Balanced size / compat |\n| baseBMP | U+00A1–U+FFEF | 15.92 | Smallest raw char count |\n\n## Compression benchmark gate\n\n| Codec | Corpus bytes | Result |\n| --- | ---: | --- |\n| arx | 11,889 brotli bytes | baseline |\n| arx2 | 11,767 brotli bytes | 1.03% smaller |\n\n## This bundle demonstrates\n\n- [x] Rich markdown with tables, task lists, code fences, and blockquotes\n- [x] Syntax-highlighted source code with line numbers\n- [x] Multi-file git diffs with split and unified views\n- [x] Tabular CSV data with sortable columns\n- [x] Structured JSON with collapsible tree navigation\n\n### How it works\n\n```\ntuple payload → overlay dictionary → arx dictionary → Brotli → baseBMP → URL fragment\n                                                                         ↑\n                                                      servers never see this part\n```\n\nAll five artifact kinds, all encoded in a single URL. Zero server-side storage. Full client-side rendering.",
      },
      {
        id: "codec-src",
        kind: "code",
        title: "arx-codec.ts (excerpt)",
        filename: "arx-codec.ts",
        language: "typescript",
        content:
          '/**\n * arx codec — Agent Render eXtreme compression\n *\n * Pipeline: JSON → dictionary substitution → Brotli → base76/base1k/baseBMP\n */\n\nimport type { ArxDictionary } from "./schema";\n\nconst HEADER_ARX76  = 0x01; // ASCII-safe base76\nconst HEADER_ARX1K  = 0x02; // Unicode base1k (U+00A1–U+07FF)\nconst HEADER_ARXBMP = 0x03; // Full BMP base (U+00A1–U+FFEF)\n\nexport interface ArxCompressResult {\n  encoded: string;\n  encoding: "base76" | "base1k" | "baseBMP";\n  compressedBytes: number;\n  ratio: number;\n}\n\nexport async function arxCompress(\n  json: string,\n  dict: ArxDictionary,\n): Promise<ArxCompressResult> {\n  // Stage 1: Dictionary substitution\n  let substituted = json;\n  for (const [pattern, replacement] of dict.entries) {\n    substituted = substituted.replaceAll(pattern, replacement);\n  }\n\n  // Stage 2: Brotli compression (quality 11)\n  const input = new TextEncoder().encode(substituted);\n  const compressed = await brotliCompress(input, { quality: 11 });\n\n  // Stage 3: Try all three encodings, pick shortest\n  const candidates: ArxCompressResult[] = [\n    { encoded: toBase76(compressed),  encoding: "base76",  compressedBytes: compressed.length, ratio: 0 },\n    { encoded: toBase1k(compressed),  encoding: "base1k",  compressedBytes: compressed.length, ratio: 0 },\n    { encoded: toBaseBMP(compressed), encoding: "baseBMP", compressedBytes: compressed.length, ratio: 0 },\n  ];\n\n  // Select the shortest encoded result\n  candidates.sort((a, b) => a.encoded.length - b.encoded.length);\n  const best = candidates[0];\n  best.ratio = json.length / best.encoded.length;\n  return best;\n}\n\nexport async function arxDecompress(\n  fragment: string,\n  dict: ArxDictionary,\n): Promise<string> {\n  const header = fragment.charCodeAt(0);\n\n  // Detect encoding from header byte\n  const compressed = header === HEADER_ARXBMP ? fromBaseBMP(fragment)\n                   : header === HEADER_ARX1K  ? fromBase1k(fragment)\n                   :                            fromBase76(fragment);\n\n  // Decompress Brotli\n  const decompressed = await brotliDecompress(compressed);\n  let json = new TextDecoder().decode(decompressed);\n\n  // Reverse dictionary substitution\n  for (const [pattern, replacement] of [...dict.entries].reverse()) {\n    json = json.replaceAll(replacement, pattern);\n  }\n\n  return json;\n}',
      },
      {
        id: "migration-diff",
        kind: "diff",
        title: "v1 → v2 migration",
        filename: "fragment.ts",
        patch:
          "diff --git a/src/lib/payload/fragment.ts b/src/lib/payload/fragment.ts\nindex aaa1111..bbb2222 100644\n--- a/src/lib/payload/fragment.ts\n+++ b/src/lib/payload/fragment.ts\n@@ -1,18 +1,42 @@\n-import { deflateSync, inflateSync } from \"fflate\";\n-import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from \"lz-string\";\n+import { deflateSync, inflateSync } from \"fflate\";\n+import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from \"lz-string\";\n+import { arxCompress, arxDecompress } from \"./arx-codec\";\n+import { loadArxDictionary } from \"./arx-dictionary\";\n \n-const CODEC_PRIORITY = [\"deflate\", \"lz\", \"plain\"] as const;\n+const SYNC_CODECS  = [\"deflate\", \"lz\", \"plain\"] as const;\n+const ASYNC_CODECS = [\"arx\", \"deflate\", \"lz\", \"plain\"] as const;\n \n export function encodeEnvelope(envelope: PayloadEnvelope): string {\n-  const json = JSON.stringify(envelope);\n-  const candidates = CODEC_PRIORITY.map((codec) => ({\n+  return encodeShortest(envelope, SYNC_CODECS);\n+}\n+\n+export async function encodeEnvelopeAsync(envelope: PayloadEnvelope): Promise<string> {\n+  return encodeShortest(envelope, ASYNC_CODECS);\n+}\n+\n+function encodeShortest(envelope: PayloadEnvelope, codecs: readonly string[]): string {\n+  const json = JSON.stringify(envelope);\n+  const candidates = codecs.map((codec) => ({\n     codec,\n-    fragment: encodeWith(json, codec),\n+    fragment: encodeWith(json, codec),\n   }));\n   candidates.sort((a, b) => a.fragment.length - b.fragment.length);\n   return candidates[0].fragment;\n }\n \n-export function decodeFragment(raw: string): PayloadEnvelope {\n+export async function decodeFragmentAsync(raw: string): Promise<PayloadEnvelope> {\n+  const match = raw.match(/^agent-render=v1\\.(\\w+)\\.(.+)$/);\n+  if (!match) throw new Error(\"Invalid fragment format\");\n+  const [, codec, payload] = match;\n+\n+  if (codec === \"arx\") {\n+    const [dictVersion, ...rest] = payload.split(\".\");\n+    const dict = await loadArxDictionary(dictVersion);\n+    const json = await arxDecompress(rest.join(\".\"), dict);\n+    return JSON.parse(json);\n+  }\n+\n+  return decodeFragment(raw);\n+}\n+\n+export function decodeFragment(raw: string): PayloadEnvelope {\n   const match = raw.match(/^agent-render=v1\\.(\\w+)\\.(.+)$/);\n   if (!match) throw new Error(\"Invalid fragment format\");\n   const [, codec, payload] = match;\n",
        view: "unified",
      },
      {
        id: "metrics",
        kind: "csv",
        title: "Bundle metrics",
        filename: "benchmarks.csv",
        content:
          "codec,corpus_brotli_bytes,delta_vs_arx\narx,11889,baseline\narx2,11767,+1.03%\n",
      },
      {
        id: "manifest",
        kind: "json",
        title: "Artifact manifest",
        filename: "manifest.json",
        content:
          '{\n  "name": "agent-render",\n  "version": "2.0.0",\n  "description": "Fragment-powered artifact viewer with arx2 compression",\n  "transport": {\n    "method": "url-fragment",\n    "prefix": "agent-render=v1",\n    "codecs": ["plain", "lz", "deflate", "arx", "arx2"],\n    "preferred": "arx2",\n    "maxFragmentChars": 8192,\n    "maxDecodedChars": 200000\n  },\n  "arx2": {\n    "pipeline": ["tuple-envelope", "overlay-substitution", "shared-dictionary-substitution", "brotli-q11", "binary-to-text"],\n    "encodings": {\n      "base76": { "charset": "ascii", "bitsPerChar": 6.27, "maxCompat": true },\n      "base64url": { "charset": "ascii-url-safe", "bitsPerChar": 6.0 },\n      "base1k": { "charset": "U+00A1-U+07FF", "bitsPerChar": 10.79 },\n      "baseBMP": { "charset": "U+00A1-U+FFEF", "bitsPerChar": 15.92, "smallest": true }\n    },\n    "dictionaries": {\n      "shared": "/arx-dictionary.json",\n      "overlay": "/arx2-dictionary.json"\n    }\n  },\n  "artifacts": {\n    "kinds": ["markdown", "code", "diff", "csv", "json"],\n    "thisBundle": [\n      { "id": "release-notes", "kind": "markdown", "title": "v2.0 release notes" },\n      { "id": "codec-src", "kind": "code", "title": "arx-codec.ts (excerpt)" },\n      { "id": "migration-diff", "kind": "diff", "title": "v1 → v2 migration" },\n      { "id": "metrics", "kind": "csv", "title": "Bundle metrics" },\n      { "id": "manifest", "kind": "json", "title": "Artifact manifest" }\n    ]\n  },\n  "features": {\n    "zeroRetention": true,\n    "serverNeverSeesPayload": true,\n    "clientSideOnly": true,\n    "selfHostable": true,\n    "openSource": true\n  }\n}',
      },
    ],
  },
  {
    v: 1,
    codec: "plain",
    title: "Malformed manifest",
    activeArtifactId: "broken-manifest",
    artifacts: [
      {
        id: "broken-manifest",
        kind: "json",
        title: "Broken manifest",
        filename: "broken-manifest.json",
        content: '{\n  "release": "0.1.0",\n  "transport": "fragment",\n  "ready": true,\n',
      },
    ],
  },
];

const sampleDescriptions: Record<string, string> = {
  "arx showcase":
    "Dictionary substitution, Brotli, and high-density Unicode encoding compress 5 rich artifacts into a single URL fragment.",
};

export const sampleLinks = sampleEnvelopes.map((envelope) => {
  const activeArtifact = envelope.artifacts.find((artifact) => artifact.id === envelope.activeArtifactId) ?? envelope.artifacts[0];
  const title = envelope.title ?? "Sample payload";

  return {
    title,
    hash: `#${encodeEnvelope(envelope)}`,
    kind: activeArtifact?.kind ?? "markdown",
    description: sampleDescriptions[title],
  };
});
