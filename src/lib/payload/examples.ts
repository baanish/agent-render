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
    // The benchmark figures in the release-notes table and the benchmarks.csv below
    // (5,544 / 5,410 brotli bytes, 7,585 / 7,416 / 2,931 visible chars, 2.42% / 60.48%)
    // are the corpus totals committed in scripts/bench-baseline.json (npm run bench:codecs).
    // tests/examples-arx3-benchmark.test.ts pins this prose to that baseline as the source
    // of truth — update both together if the codec output changes.
    artifacts: [
      {
        id: "release-notes",
        kind: "markdown",
        title: "v3.0 release notes",
        filename: "RELEASE.md",
        content:
          "# agent-render — ARX6 shareable links\n\n> **Everything you see here is encoded in the URL fragment.** The host receives no artifact body in the page request.\n\n## What is ARX6?\n\nARX6 compresses raw artifact bodies with a causal context model and a compact metadata trailer. Automatic encoding compares it with the complete legacy pool: arx5, arx2, arx, deflate, lz, and plain. Under the default policy, ARX6 replaces that result only when both its conservative transport score and its actual serialized URL are strictly shorter. Ties keep the legacy wire. An explicit size budget takes priority when only ARX6 fits.\n\nNew ARX6 links start with `#g3<prior><digits>`. Frozen `#g2` links and original `#gm`, `#gc`, `#gj`, `#gs`, and `#gn` links remain decodable. arx3 and arx4 remain available explicitly; visible Unicode savings do not establish shorter percent-escaped URLs.\n\n## This bundle demonstrates\n\n- [x] Rich markdown with tables, task lists, code fences, and blockquotes\n- [x] Syntax-highlighted source code with line numbers\n- [x] Multi-file git diffs with split and unified views\n- [x] Tabular CSV data with sortable columns\n- [x] Structured JSON with collapsible tree navigation\n\n## Historical compression benchmark\n\nThese figures describe the committed arx/arx2/arx3 fixture, not ARX6. Visible character counts alone are not complete URL or chat-link measurements.\n\n| Codec | Corpus bytes | Visible chars | Result |\n| --- | ---: | ---: | --- |\n| arx | 5,544 | 7,585 | baseline |\n| arx2 | 5,410 | 7,416 | 2.42% fewer bytes |\n| arx3 | 5,410 | 2,931 | 60.48% fewer visible chars vs arx2 |\n\nAll five artifact kinds travel in one URL and render in the browser. Zero server-side storage.\n",
      },
      {
        id: "codec-src",
        kind: "code",
        title: "arx-codec.ts (excerpt)",
        filename: "arx-codec.ts",
        language: "typescript",
        content:
          "/** Create a fragment with the production automatic selector. */\nimport { encodeEnvelopeAsync, decodeFragmentAsync } from \"@/lib/payload/fragment\";\nimport type { PayloadEnvelope } from \"@/lib/payload/schema\";\n\nconst envelope: PayloadEnvelope = {\n  v: 1,\n  codec: \"plain\",\n  artifacts: [{ id: \"a\", kind: \"markdown\", content: \"# Hello\\n\" }],\n};\n\n// ARX6 is selected only when it improves on the complete legacy pool.\nconst fragment = await encodeEnvelopeAsync(envelope);\nconst link = `https://agent-render.com/#${fragment}`;\nconst result = await decodeFragmentAsync(new URL(link).hash);\nif (!result.ok) throw new Error(result.message);\n\n// Explicit ARX6 emits g3; callers can still request the frozen g2 model\n// through arx6CompressEnvelope(envelope, undefined, 2).\nconst arx6 = await encodeEnvelopeAsync(envelope, { codec: \"arx6\" });\n",
      },
      {
        id: "migration-diff",
        kind: "diff",
        title: "ARX6 v2 to v3 migration",
        filename: "fragment.ts",
        patch:
          "diff --git a/src/lib/payload/arx6-codec.ts b/src/lib/payload/arx6-codec.ts\n--- a/src/lib/payload/arx6-codec.ts\n+++ b/src/lib/payload/arx6-codec.ts\n@@ -1 +1 @@\n-const ARX6_VERSION = 2;\n+const ARX6_VERSION = 3;\n",
        view: "unified",
      },
      {
        id: "metrics",
        kind: "csv",
        title: "Bundle metrics",
        filename: "benchmarks.csv",
        content:
          "codec,corpus_brotli_bytes,visible_chars,result\narx,5544,7585,baseline\narx2,5410,7416,2.42% fewer bytes\narx3,5410,2931,60.48% fewer visible chars vs arx2\n",
      },
      {
        id: "manifest",
        kind: "json",
        title: "Artifact manifest",
        filename: "manifest.json",
        content:
          "{\n  \"name\": \"agent-render\",\n  \"description\": \"Fragment-powered artifact viewer with ARX6 and legacy codec fallback\",\n  \"transport\": {\n    \"method\": \"url-fragment\",\n    \"format\": \"#<tag><payload>\",\n    \"legacyDecodeFormat\": \"#agent-render=v1.<codec>.<payload>\",\n    \"codecs\": [\n      \"plain\",\n      \"lz\",\n      \"deflate\",\n      \"arx\",\n      \"arx2\",\n      \"arx3\",\n      \"arx4\",\n      \"arx5\",\n      \"arx6\"\n    ],\n    \"preferred\": \"auto\",\n    \"defaultSelection\": \"Use ARX6 only if both transport score and serialized URL are strictly shorter than the complete legacy pool; preserve legacy ties.\",\n    \"explicitBudgetSelection\": \"When only ARX6 fits the requested budget, use it.\",\n    \"maxFragmentChars\": 8192,\n    \"maxDecodedChars\": 200000\n  },\n  \"arx6\": {\n    \"modelVersion\": 3,\n    \"emittedFormat\": \"#g3<prior><digits>\",\n    \"frozenDecodeFormats\": [\n      \"#g2<prior><digits>\",\n      \"#g<prior><fraction>\"\n    ],\n    \"pipeline\": [\n      \"raw-artifact-bodies\",\n      \"tuple-metadata-trailer\",\n      \"canonical-wtf8\",\n      \"causal-context-model\",\n      \"crc32-bound-mixed-radix-fraction\"\n    ],\n    \"alphabet\": \"0-9A-Za-z-._~\",\n    \"integrity\": \"CRC32 detects accidental corruption; it is not authentication.\"\n  },\n  \"artifacts\": {\n    \"kinds\": [\n      \"markdown\",\n      \"code\",\n      \"diff\",\n      \"csv\",\n      \"json\"\n    ],\n    \"thisBundle\": [\n      {\n        \"id\": \"release-notes\",\n        \"kind\": \"markdown\",\n        \"title\": \"v3.0 release notes\"\n      },\n      {\n        \"id\": \"codec-src\",\n        \"kind\": \"code\",\n        \"title\": \"arx-codec.ts (excerpt)\"\n      },\n      {\n        \"id\": \"migration-diff\",\n        \"kind\": \"diff\",\n        \"title\": \"ARX6 v2 to v3 migration\"\n      },\n      {\n        \"id\": \"metrics\",\n        \"kind\": \"csv\",\n        \"title\": \"Bundle metrics\"\n      },\n      {\n        \"id\": \"manifest\",\n        \"kind\": \"json\",\n        \"title\": \"Artifact manifest\"\n      }\n    ]\n  },\n  \"features\": {\n    \"zeroRetention\": true,\n    \"serverNeverSeesPayload\": true,\n    \"clientSideOnly\": true,\n    \"selfHostable\": true,\n    \"openSource\": true\n  }\n}",
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
    "Tuple compression and the context mixer, scored by honest transport length, compress 5 rich artifacts into a chat-safe URL fragment.",
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
