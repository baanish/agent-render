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
          "# Sprint roadmap\n\n- Ship the static viewer shell\n- Keep payloads in the URL fragment\n- Land dedicated renderers in later sprints",
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
        title: "hello.ts diff",
        filename: "hello.patch",
        patch: "diff --git a/hello.ts b/hello.ts\nindex 1111111..2222222 100644\n--- a/hello.ts\n+++ b/hello.ts\n@@ -1 +1 @@\n-console.log('hello')\n+console.log('hello, world')\n",
        view: "unified",
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
        content: "artifact,kind,chars\nroadmap,markdown,124\nviewer-shell,code,95\npatch,diff,173",
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
          '{\n  "release": "0.1.0",\n  "artifacts": ["overview", "manifest", "metrics"],\n  "transport": "fragment"\n}',
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
];

export const sampleLinks = sampleEnvelopes.map((envelope) => {
  const activeArtifact = envelope.artifacts.find((artifact) => artifact.id === envelope.activeArtifactId) ?? envelope.artifacts[0];

  return {
    title: envelope.title ?? "Sample payload",
    hash: `#${encodeEnvelope(envelope)}`,
    kind: activeArtifact?.kind ?? "markdown",
  };
});
