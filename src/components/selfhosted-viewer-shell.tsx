"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileCode2,
  FileDiff,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Printer,
} from "lucide-react";
import {
  artifactKinds,
  type ArtifactKind,
  type ArtifactPayload,
  type CodeArtifact,
  type CsvArtifact,
  type DiffArtifact,
  type JsonArtifact,
  type MarkdownArtifact,
  type PayloadEnvelope,
} from "@/lib/payload/schema";
import { copyTextToClipboard } from "@/lib/copy-text";
import { cn } from "@/lib/utils";
import { ArtifactSelector } from "@/components/viewer/artifact-selector";
import { ThemeToggle } from "@/components/theme-toggle";

const numberFormatter = new Intl.NumberFormat("en-US");

const kindIcons: Record<ArtifactKind, LucideIcon> = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};

const iconPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

const MarkdownRenderer = dynamic(
  () => import("@/components/renderers/markdown-renderer").then((m) => m.MarkdownRenderer),
  { ssr: false },
);
const CodeRenderer = dynamic(
  () => import("@/components/renderers/code-renderer").then((m) => m.CodeRenderer),
  { ssr: false },
);
const DiffRenderer = dynamic(
  () => import("@/components/renderers/diff-renderer").then((m) => m.DiffRenderer),
  { ssr: false },
);
const CsvRenderer = dynamic(
  () => import("@/components/renderers/csv-renderer").then((m) => m.CsvRenderer),
  { ssr: false },
);
const JsonRenderer = dynamic(
  () => import("@/components/renderers/json-renderer").then((m) => m.JsonRenderer),
  { ssr: false },
);

function getArtifactBody(artifact: ArtifactPayload): string {
  if (artifact.kind === "diff") {
    return artifact.patch ?? `${artifact.oldContent ?? ""}\n---\n${artifact.newContent ?? ""}`;
  }
  return artifact.content;
}

function getArtifactSubtitle(artifact: ArtifactPayload): string {
  if (artifact.kind === "markdown") return "GFM markdown artifact";
  if (artifact.kind === "code") return artifact.language ? `${artifact.language} source artifact` : "Source artifact";
  if (artifact.kind === "diff") return artifact.view ? `${artifact.view} diff artifact` : "Patch artifact";
  if (artifact.kind === "json") return "Structured data artifact";
  if (artifact.kind === "csv") return "Tabular data artifact";
  return "Document artifact";
}

function getArtifactHeading(artifact: ArtifactPayload): string {
  return artifact.title ?? artifact.filename ?? artifact.id;
}

function getDownloadFilename(artifact: ArtifactPayload): string {
  if (artifact.filename) return artifact.filename;
  if (artifact.kind === "markdown") return `${artifact.id}.md`;
  if (artifact.kind === "csv") return `${artifact.id}.csv`;
  if (artifact.kind === "json") return `${artifact.id}.json`;
  if (artifact.kind === "diff") return `${artifact.id}.patch`;
  return `${artifact.id}.txt`;
}

/**
 * Client-side viewer shell for the self-hosted variant.
 *
 * Accepts a pre-fetched `PayloadEnvelope` (parsed from the server-side DB lookup) and renders
 * the same artifact stage, toolbar, and renderer slots used by the fragment-based `ViewerShell`.
 * Artifact switching is handled in local state instead of URL fragment encoding.
 *
 * @param props.envelope - The decoded payload envelope to render.
 * @param props.artifactId - The UUID of this artifact (used for API delete).
 */
export function SelfHostedViewerShell({
  envelope,
  artifactId,
}: {
  envelope: PayloadEnvelope;
  artifactId: string;
}) {
  const [activeArtifactId, setActiveArtifactId] = useState(
    envelope.activeArtifactId ?? envelope.artifacts[0]?.id,
  );
  const [rendererReady, setRendererReady] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const activeArtifactRef = useRef<ArtifactPayload | null>(null);
  const copyTokenRef = useRef(0);

  const activeArtifact =
    envelope.artifacts.find((a) => a.id === activeArtifactId) ?? envelope.artifacts[0];
  activeArtifactRef.current = activeArtifact;

  const markdownArtifact: MarkdownArtifact | null = activeArtifact?.kind === "markdown" ? activeArtifact : null;
  const codeArtifact: CodeArtifact | null = activeArtifact?.kind === "code" ? activeArtifact : null;
  const diffArtifact: DiffArtifact | null = activeArtifact?.kind === "diff" ? activeArtifact : null;
  const csvArtifact: CsvArtifact | null = activeArtifact?.kind === "csv" ? activeArtifact : null;
  const jsonArtifact: JsonArtifact | null = activeArtifact?.kind === "json" ? activeArtifact : null;

  useEffect(() => {
    setRendererReady(false);
  }, [activeArtifact?.id]);

  useEffect(() => {
    if (activeArtifact && !markdownArtifact && !codeArtifact && !diffArtifact && !csvArtifact && !jsonArtifact) {
      setRendererReady(true);
    }
  }, [activeArtifact, markdownArtifact, codeArtifact, diffArtifact, csvArtifact, jsonArtifact]);

  const markRendererReady = useCallback(() => setRendererReady(true), []);

  useEffect(() => {
    setCopyState("idle");
  }, [activeArtifact?.id]);

  useEffect(() => {
    if (copyState !== "copied" && copyState !== "failed") return;
    const t = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [copyState]);

  const handleArtifactSelect = useCallback((id: string) => {
    setActiveArtifactId(id);
  }, []);

  const handleCopy = useCallback(async () => {
    const artifact = activeArtifactRef.current;
    if (!artifact) return;
    const reqId = artifact.id;
    const reqToken = ++copyTokenRef.current;
    try {
      await copyTextToClipboard(getArtifactBody(artifact));
      if (activeArtifactRef.current?.id !== reqId || copyTokenRef.current !== reqToken) return;
      setCopyState("copied");
    } catch {
      if (activeArtifactRef.current?.id !== reqId || copyTokenRef.current !== reqToken) return;
      setCopyState("failed");
    }
  }, []);

  const handleDownload = useCallback(() => {
    if (!activeArtifact) return;
    const mimeType =
      activeArtifact.kind === "markdown"
        ? "text/markdown;charset=utf-8"
        : activeArtifact.kind === "json"
          ? "application/json;charset=utf-8"
          : activeArtifact.kind === "csv"
            ? "text/csv;charset=utf-8"
            : activeArtifact.kind === "diff"
              ? "text/x-diff;charset=utf-8"
              : "text/plain;charset=utf-8";
    const blob = new Blob([getArtifactBody(activeArtifact)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = getDownloadFilename(activeArtifact);
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [activeArtifact]);

  const handlePrint = useCallback(() => {
    if (!markdownArtifact) return;
    const cleanup = () => {
      delete document.body.dataset.printMode;
      window.removeEventListener("afterprint", cleanup);
    };
    document.body.dataset.printMode = "markdown";
    window.addEventListener("afterprint", cleanup);
    window.requestAnimationFrame(() => window.print());
  }, [markdownArtifact]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this artifact? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/artifacts/${artifactId}`, { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/";
      }
    } catch {
      /* ignore */
    }
  }, [artifactId]);

  return (
    <main
      className="app-shell min-h-screen px-2 pb-5 pt-2.5 sm:px-6 sm:pb-12 sm:pt-5 lg:px-10 lg:pt-7"
      data-testid="viewer-shell"
      data-viewer-state="artifact"
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3.5 sm:gap-6">
        <header className="panel print-hide-on-markdown fade-up sticky top-2 z-30 flex flex-col gap-2 px-3 py-2.5 sm:top-4 sm:gap-4 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 sm:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 rounded-[var(--radius-lg)] -m-1 p-1"
            aria-label="Go to homepage"
          >
            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] shadow-[var(--shadow-md)] sm:h-11 sm:w-11">
              <Image src={iconPath} alt="" width={24} height={24} className="h-5 w-5 sm:h-6 sm:w-6" priority unoptimized />
            </div>
            <h1 className="font-display text-lg font-semibold tracking-[-0.03em] sm:text-2xl">agent-render</h1>
            </Link>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="mono-pill shell-pill">Self-hosted</span>
            <ThemeToggle />
          </div>
        </header>

        <section className="artifact-first-layout">
          <section className="panel fade-up print-hide-on-markdown px-2.5 py-2.5 sm:px-5 sm:py-4">
            <div className="artifact-bundle-header">
              <div>
                <p className="section-kicker">Artifact bundle</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5 sm:mt-2 sm:gap-3">
                  <h2 className="text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">
                    {envelope.title ?? "Untitled bundle"}
                  </h2>
                  <span className="mono-pill">
                    {envelope.artifacts.length} item{envelope.artifacts.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1.5 max-w-3xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-2 sm:leading-6">
                  Select an artifact to switch the rendered view below.
                </p>
              </div>
            </div>

            {envelope.artifacts.length > 1 ? (
              <ArtifactSelector
                artifacts={envelope.artifacts}
                activeArtifactId={activeArtifact.id}
                getHeading={getArtifactHeading}
                getSupportingLabel={(a) =>
                  a.filename && a.filename !== getArtifactHeading(a) ? a.filename : a.id
                }
                kindIcons={kindIcons}
                onSelect={handleArtifactSelect}
              />
            ) : null}
          </section>

          <section className="panel panel-strong fade-up overflow-hidden px-2.5 py-2.5 sm:px-5 sm:py-4">
            <div className="artifact-stage-head print-hide-on-markdown">
              <div className="min-w-0">
                <p className="section-kicker">{getArtifactSubtitle(activeArtifact)}</p>
                <h3 className="font-display mt-1.5 text-[1.7rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:mt-2 sm:text-4xl sm:leading-tight">
                  {getArtifactHeading(activeArtifact)}
                </h3>
                <p className="mt-1.5 max-w-3xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-2 sm:leading-6">
                  {activeArtifact.filename && activeArtifact.filename !== getArtifactHeading(activeArtifact)
                    ? activeArtifact.filename
                    : activeArtifact.id}
                </p>
              </div>

              <div className="viewer-toolbar">
                <button
                  type="button"
                  className={cn("artifact-action", copyState === "copied" && "is-primary")}
                  onClick={handleCopy}
                >
                  {copyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
                </button>
                <button type="button" className="artifact-action is-primary" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                {markdownArtifact ? (
                  <button type="button" className="artifact-action" onClick={handlePrint}>
                    <Printer className="h-3.5 w-3.5" />
                    Print / PDF
                  </button>
                ) : null}
                <span className="mono-pill">{activeArtifact.kind}</span>
              </div>
            </div>

            <div className="viewer-frame viewer-frame-primary viewer-frame-hero">
              <div className={cn("artifact-preview", markdownArtifact && "is-markdown print-markdown-target")}>
                {markdownArtifact ? (
                  <MarkdownRenderer artifact={markdownArtifact} onReady={markRendererReady} />
                ) : codeArtifact ? (
                  <CodeRenderer artifact={codeArtifact} onReady={markRendererReady} />
                ) : diffArtifact ? (
                  <DiffRenderer artifact={diffArtifact} onReady={markRendererReady} />
                ) : csvArtifact ? (
                  <CsvRenderer artifact={csvArtifact} onReady={markRendererReady} />
                ) : jsonArtifact ? (
                  <JsonRenderer artifact={jsonArtifact} onReady={markRendererReady} />
                ) : (
                  <pre>{getArtifactBody(activeArtifact).trim().slice(0, 960) || "Empty artifact."}</pre>
                )}
              </div>
            </div>
          </section>

          <section className="print-hide-on-markdown fade-up">
            <div className="artifact-meta-grid" data-testid="artifact-metadata-grid">
              {[
                { label: "Kind", value: activeArtifact.kind },
                { label: "Artifact", value: activeArtifact.id },
                { label: "File", value: activeArtifact.filename ?? "Not provided" },
                { label: "Size", value: `${numberFormatter.format(getArtifactBody(activeArtifact).length)} chars` },
                ...(activeArtifact.kind === "code"
                  ? [{ label: "Language", value: activeArtifact.language ?? "Auto" }]
                  : []),
                ...(activeArtifact.kind === "diff"
                  ? [{ label: "View", value: activeArtifact.view ?? "Unified" }]
                  : []),
              ].map((row) => (
                <div key={row.label} className="artifact-meta-card">
                  <p className="metric-label">{row.label}</p>
                  <p className="artifact-meta-value">{row.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                className="artifact-action text-[color:var(--danger)]"
                onClick={handleDelete}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Delete artifact
              </button>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
