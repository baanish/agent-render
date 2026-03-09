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
    title: "Release bundle",
    activeArtifactId: "manifest",
    artifacts: [
      {
        id: "overview",
        kind: "markdown",
        title: "Release overview",
        filename: "release-notes.md",
        content: "# Release overview\n\nThis bundle keeps a short editorial summary next to machine-readable metadata.",
      },
      {
        id: "manifest",
        kind: "json",
        title: "Artifact manifest",
        filename: "manifest.json",
        content:
          '{\n  "release": "0.1.0",\n  "artifacts": ["overview", "manifest", "metrics"],\n  "transport": "fragment",\n  "ready": true\n}',
      },
      {
        id: "metrics",
        kind: "csv",
        title: "Bundle metrics",
        filename: "metrics.csv",
        content: "name,status\noverview,ready\nmanifest,ready\nmetrics,ready",
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

export const sampleLinks = sampleEnvelopes.map((envelope) => {
  const activeArtifact = envelope.artifacts.find((artifact) => artifact.id === envelope.activeArtifactId) ?? envelope.artifacts[0];

  return {
    title: envelope.title ?? "Sample payload",
    hash: `#${encodeEnvelope(envelope)}`,
    kind: activeArtifact?.kind ?? "markdown",
  };
});
