"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Download,
  ChevronRight,
  FileCode2,
  FileDiff,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Hash,
  Layers3,
  LockKeyhole,
  Printer,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { sampleEnvelopes, sampleLinks } from "@/lib/payload/examples";
import { decodeFragment, encodeEnvelope } from "@/lib/payload/fragment";
import {
  MAX_FRAGMENT_LENGTH,
  PAYLOAD_FRAGMENT_KEY,
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
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const numberFormatter = new Intl.NumberFormat("en-US");

const kindIcons: Record<ArtifactKind, LucideIcon> = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};

const sampleCards = sampleLinks.map((link, index) => ({
  ...link,
  envelope: sampleEnvelopes[index],
  fragmentLength: link.hash.length - 1,
}));

const MarkdownRenderer = dynamic(
  () => import("@/components/renderers/markdown-renderer").then((module) => module.MarkdownRenderer),
  { ssr: false },
);
const CodeRenderer = dynamic(() => import("@/components/renderers/code-renderer").then((module) => module.CodeRenderer), {
  ssr: false,
});
const DiffRenderer = dynamic(() => import("@/components/renderers/diff-renderer").then((module) => module.DiffRenderer), {
  ssr: false,
});
const CsvRenderer = dynamic(() => import("@/components/renderers/csv-renderer").then((module) => module.CsvRenderer), {
  ssr: false,
});
const JsonRenderer = dynamic(
  () => import("@/components/renderers/json-renderer").then((module) => module.JsonRenderer),
  { ssr: false },
);

function getActiveArtifact(envelope: PayloadEnvelope): ArtifactPayload {
  return envelope.artifacts.find((artifact) => artifact.id === envelope.activeArtifactId) ?? envelope.artifacts[0];
}

function getArtifactBody(artifact: ArtifactPayload): string {
  if (artifact.kind === "diff") {
    return artifact.patch ?? `${artifact.oldContent ?? ""}\n---\n${artifact.newContent ?? ""}`;
  }

  return artifact.content;
}

function getArtifactSubtitle(artifact: ArtifactPayload): string {
  if (artifact.kind === "markdown") {
    return "GFM markdown artifact";
  }

  if (artifact.kind === "code") {
    return artifact.language ? `${artifact.language} source artifact` : "Source artifact";
  }

  if (artifact.kind === "diff") {
    return artifact.view ? `${artifact.view} diff artifact` : "Patch artifact";
  }

  if (artifact.kind === "json") {
    return "Structured data artifact";
  }

  if (artifact.kind === "csv") {
    return "Tabular data artifact";
  }

  return "Document artifact";
}

function getArtifactDetailRows(artifact: ArtifactPayload) {
  const rows = [
    { label: "Artifact id", value: artifact.id },
    { label: "Kind", value: artifact.kind },
    { label: "Filename", value: artifact.filename ?? "Not provided" },
    { label: "Payload size", value: `${numberFormatter.format(getArtifactBody(artifact).length)} chars` },
  ];

  if (artifact.kind === "code") {
    rows.push({ label: "Language", value: artifact.language ?? "Auto later" });
  }

  if (artifact.kind === "diff") {
    rows.push({ label: "View mode", value: artifact.view ?? "Unified later" });
  }

  return rows;
}

function getPreviewText(artifact: ArtifactPayload): string {
  return getArtifactBody(artifact).trim().slice(0, 960) || "Artifact contents will appear here once a renderer is attached.";
}

function getDownloadFilename(artifact: ArtifactPayload): string {
  if (artifact.filename) {
    return artifact.filename;
  }

  if (artifact.kind === "markdown") {
    return `${artifact.id}.md`;
  }

  if (artifact.kind === "csv") {
    return `${artifact.id}.csv`;
  }

  if (artifact.kind === "json") {
    return `${artifact.id}.json`;
  }

  if (artifact.kind === "diff") {
    return `${artifact.id}.patch`;
  }

  return `${artifact.id}.txt`;
}

function getHashPreview(hash: string): string {
  if (!hash) {
    return `#${PAYLOAD_FRAGMENT_KEY}=v1.plain.<base64url-encoded-json>`;
  }

  if (hash.length <= 220) {
    return hash;
  }

  return `${hash.slice(0, 160)}...${hash.slice(-44)}`;
}

function getStatusTone(parsed: ReturnType<typeof decodeFragment>) {
  if (parsed.ok) {
    return {
      label: "Decoded",
      color: "var(--success)",
      message: "Envelope is valid and ready for viewer routing.",
    };
  }

  if (parsed.code === "empty") {
    return {
      label: "Awaiting fragment",
      color: "var(--accent-secondary)",
      message: parsed.message,
    };
  }

  return {
    label: "Needs correction",
    color: "var(--danger)",
    message: parsed.message,
  };
}

function getAnimationStyle(delay: number): CSSProperties {
  return { animationDelay: `${delay}ms` };
}

export function ViewerShell() {
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => {
      setHash(window.location.hash);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);

    return () => {
      window.removeEventListener("hashchange", syncHash);
    };
  }, []);

  const parsed = useMemo(() => decodeFragment(hash), [hash]);
  const fragmentLength = hash.startsWith("#") ? hash.length - 1 : hash.length;
  const envelope = parsed.ok ? parsed.envelope : null;
  const activeArtifact = envelope ? getActiveArtifact(envelope) : null;
  const markdownArtifact: MarkdownArtifact | null = activeArtifact?.kind === "markdown" ? activeArtifact : null;
  const codeArtifact: CodeArtifact | null = activeArtifact?.kind === "code" ? activeArtifact : null;
  const diffArtifact: DiffArtifact | null = activeArtifact?.kind === "diff" ? activeArtifact : null;
  const csvArtifact: CsvArtifact | null = activeArtifact?.kind === "csv" ? activeArtifact : null;
  const jsonArtifact: JsonArtifact | null = activeArtifact?.kind === "json" ? activeArtifact : null;
  const budgetRatio = Math.min(fragmentLength / MAX_FRAGMENT_LENGTH, 1);
  const statusTone = getStatusTone(parsed);

  const setFragmentHash = useCallback((nextHash: string) => {
    if (window.location.hash === nextHash) {
      return;
    }

    window.history.replaceState(null, "", nextHash);
    setHash(nextHash);
  }, []);

  const handleArtifactSelect = useCallback(
    (artifactId: string) => {
      if (!envelope || envelope.activeArtifactId === artifactId) {
        return;
      }

      const nextHash = `#${encodeEnvelope({ ...envelope, activeArtifactId: artifactId }, { codec: envelope.codec })}`;
      setFragmentHash(nextHash);
    },
    [envelope, setFragmentHash],
  );

  const handleArtifactDownload = useCallback(() => {
    if (!activeArtifact) {
      return;
    }

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

    const blob = new Blob([getArtifactBody(activeArtifact)], {
      type: mimeType,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = getDownloadFilename(activeArtifact);
    anchor.click();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }, [activeArtifact]);

  const handleMarkdownPrint = useCallback(() => {
    if (!markdownArtifact) {
      return;
    }

    const cleanup = () => {
      delete document.body.dataset.printMode;
      window.removeEventListener("afterprint", cleanup);
    };

    document.body.dataset.printMode = "markdown";
    window.addEventListener("afterprint", cleanup);
    window.requestAnimationFrame(() => {
      window.print();
    });
  }, [markdownArtifact]);

  return (
    <main className="app-shell min-h-screen px-4 pb-10 pt-5 sm:px-6 sm:pb-12 lg:px-10 lg:pt-7">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="panel print-hide-on-markdown fade-up sticky top-4 z-30 flex flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] shadow-[var(--shadow-md)]">
              <Layers3 className="h-5 w-5 text-[color:var(--accent)]" />
            </div>
            <div>
              <p className="section-kicker">Phase 1 artifact shell</p>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <h1 className="font-display text-xl font-semibold tracking-[-0.03em] sm:text-2xl">agent-render</h1>
                <span className="mono-pill">single exported route</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="mono-pill hidden sm:inline-flex">
              <Hash className="h-3.5 w-3.5" />
              {PAYLOAD_FRAGMENT_KEY}
            </span>
            <span className="mono-pill hidden sm:inline-flex">
              <LockKeyhole className="h-3.5 w-3.5" />
              zero retention
            </span>
            <ThemeToggle />
          </div>
        </header>

        {activeArtifact && envelope ? (
          <section className="viewer-focused-layout">
            <aside className="viewer-sidebar print-hide-on-markdown">
              <div className="panel px-5 py-5 sm:px-6">
                <p className="section-kicker">Artifact bundle</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{envelope.title ?? "Untitled bundle"}</h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                  {envelope.artifacts.length} artifact{envelope.artifacts.length === 1 ? "" : "s"} in this fragment bundle. Selecting one updates the active artifact in the URL.
                </p>

                <div className="mt-5 grid gap-3">
                  {envelope.artifacts.map((artifact) => {
                    const Icon = kindIcons[artifact.kind];
                    const isCurrent = artifact.id === activeArtifact.id;

                    return (
                      <button
                        key={artifact.id}
                        type="button"
                        className={cn("artifact-switcher", isCurrent && "is-active")}
                        onClick={() => handleArtifactSelect(artifact.id)}
                      >
                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mono-pill !px-2.5 !py-1">
                              <Icon className="h-3.5 w-3.5" />
                              {artifact.kind}
                            </span>
                            {isCurrent ? <span className="section-kicker">active</span> : null}
                          </div>
                          <p className="mt-3 truncate text-sm font-semibold leading-6">{artifact.title ?? artifact.filename ?? artifact.id}</p>
                          <p className="mt-1 truncate text-sm leading-6 text-[color:var(--text-muted)]">{artifact.id}</p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="panel px-5 py-5 sm:px-6">
                <p className="section-kicker">Fragment inspector</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-semibold tracking-[-0.03em]">Current URL state</h3>
                  <span className="mono-pill" style={{ borderColor: statusTone.color, color: statusTone.color }}>
                    {statusTone.label}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">{statusTone.message}</p>
                <div className="metric-grid mt-5">
                  <div className="metric-card">
                    <p className="metric-label">Fragment budget</p>
                    <p className="metric-value">{numberFormatter.format(fragmentLength)} / {numberFormatter.format(MAX_FRAGMENT_LENGTH)}</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Codec</p>
                    <p className="metric-value">{parsed.ok ? parsed.envelope.codec : "plain"}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <p className="metric-label">Hash preview</p>
                  <pre className="font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)]">
                    {getHashPreview(hash)}
                  </pre>
                </div>
              </div>
            </aside>

            <section className="panel panel-strong fade-up overflow-hidden px-5 py-5 sm:px-6" style={getAnimationStyle(120)}>
              <div className="print-hide-on-markdown flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--border)] pb-5">
                <div>
                  <p className="section-kicker">Viewer shell</p>
                  <h3 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                    {activeArtifact.title ?? envelope.title ?? "Artifact viewer"}
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)]">
                    {`${getArtifactSubtitle(activeArtifact)} selected from the decoded fragment. The viewer now prioritizes the active artifact and keeps bundle navigation alongside it.`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="artifact-action is-primary" onClick={handleArtifactDownload}>
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </button>
                  {markdownArtifact ? (
                    <button type="button" className="artifact-action" onClick={handleMarkdownPrint}>
                      <Printer className="h-3.5 w-3.5" />
                      Print / PDF
                    </button>
                  ) : null}
                  <span className="mono-pill">{activeArtifact.kind}</span>
                </div>
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[1.22fr_0.78fr]">
                <div className="flex flex-col gap-5">
                  <div className="viewer-frame viewer-frame-primary">
                    <div className="viewer-head print-hide-on-markdown">
                      <div>
                        <p className="metric-label">Active artifact metadata</p>
                        <h4 className="mt-2 text-lg font-semibold">{activeArtifact.filename ?? activeArtifact.id}</h4>
                      </div>
                      <div className="viewer-toolbar">
                        <span className="mono-pill">{activeArtifact.kind}</span>
                      </div>
                    </div>

                    <div className={cn("artifact-preview", markdownArtifact && "is-markdown print-markdown-target")}>
                      {markdownArtifact ? (
                        <>
                          <div className="print-hide-on-markdown mb-4 flex flex-wrap items-center gap-2">
                            <span className="mono-pill !border-[color:var(--accent-secondary)] !text-[color:var(--accent-secondary)]">remark-gfm enabled</span>
                            <span className="mono-pill !border-[color:var(--border)]">raw html disabled</span>
                          </div>
                          <MarkdownRenderer artifact={markdownArtifact} />
                        </>
                      ) : codeArtifact ? (
                        <CodeRenderer artifact={codeArtifact} />
                      ) : diffArtifact ? (
                        <DiffRenderer artifact={diffArtifact} />
                      ) : csvArtifact ? (
                        <CsvRenderer artifact={csvArtifact} />
                      ) : jsonArtifact ? (
                        <JsonRenderer artifact={jsonArtifact} />
                      ) : (
                        <pre>{getPreviewText(activeArtifact)}</pre>
                      )}
                    </div>
                  </div>
                </div>

                <div className="print-hide-on-markdown flex flex-col gap-5">
                  <div className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 sm:p-5">
                    <p className="section-kicker">Decoded envelope</p>
                    <div className="mt-4 grid gap-3">
                      {getArtifactDetailRows(activeArtifact).map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] pb-3 last:border-none last:pb-0">
                          <span className="metric-label">{row.label}</span>
                          <span className="max-w-[60%] text-right text-sm font-medium leading-6 text-[color:var(--text-primary)]">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="section-kicker">Bundle summary</p>
                        <h4 className="mt-2 text-lg font-semibold">Viewer-first state</h4>
                      </div>
                      <span className="mono-pill">{envelope.artifacts.length}</span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-1">
                      <div className="metric-card">
                        <p className="metric-label">Bundle title</p>
                        <p className="metric-value">{envelope.title ?? "Untitled envelope"}</p>
                      </div>
                      <div className="metric-card">
                        <p className="metric-label">Active artifact id</p>
                        <p className="metric-value">{envelope.activeArtifactId ?? activeArtifact.id}</p>
                      </div>
                      <div className="metric-card">
                        <p className="metric-label">Transport</p>
                        <p className="metric-value">Fragment only</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="print-hide-on-markdown flex flex-col gap-6">
            <section className="panel panel-hero fade-up px-6 py-7 sm:px-8 sm:py-8" style={getAnimationStyle(80)}>
              <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
                <div>
                  <p className="section-kicker">Editorial technical viewer</p>
                  <h2 className="font-display mt-3 max-w-3xl text-4xl font-semibold leading-none tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                    Share artifacts in the URL, keep the server out of the payload.
                  </h2>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-[color:var(--text-muted)] sm:text-lg">
                    The shell now supports markdown, code, diff, CSV, and JSON artifacts while keeping fragment-native sharing and static hosting constraints intact.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className="mono-pill">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      fully static export
                    </span>
                    <span className="mono-pill">
                      <Sparkles className="h-3.5 w-3.5" />
                      contributor-friendly shell
                    </span>
                    <span className="mono-pill">
                      <FolderKanban className="h-3.5 w-3.5" />
                      renderer slots ready
                    </span>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="metric-card">
                    <p className="metric-label">Protocol shape</p>
                    <p className="font-mono mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                      #{PAYLOAD_FRAGMENT_KEY}=v1.&lt;codec&gt;.&lt;payload&gt;
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Hosting model</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                      One route, fragment-only payloads, and a shell that stays portable across GitHub Pages and other static hosts.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
              <section className="panel fade-up px-5 py-5 sm:px-6" style={getAnimationStyle(140)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-kicker">Example fragments</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Load a sample envelope</h3>
                  </div>
                  <span className="mono-pill">{sampleCards.length} presets</span>
                </div>

                <div className="mt-5 grid gap-3">
                  {sampleCards.map((sample) => {
                    const Icon = kindIcons[sample.kind];
                    const isActive = hash === sample.hash;

                    return (
                      <a key={sample.hash} href={sample.hash} className={cn("sample-link", isActive && "is-active")}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mono-pill !px-2.5 !py-1">
                              <Icon className="h-3.5 w-3.5" />
                              {sample.kind}
                            </span>
                            <span className="section-kicker">{numberFormatter.format(sample.fragmentLength)} chars</span>
                          </div>
                          <h4 className="mt-3 text-base font-semibold leading-6">{sample.title}</h4>
                          <p className="mt-1 text-sm leading-6 text-[color:var(--text-muted)]">
                            {sample.envelope.artifacts.length} artifact{sample.envelope.artifacts.length === 1 ? "" : "s"} ready for fragment decode.
                          </p>
                        </div>
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                      </a>
                    );
                  })}
                </div>
              </section>

              <section className="panel fade-up px-5 py-5 sm:px-6" style={getAnimationStyle(200)}>
                <div>
                  <p className="section-kicker">Fragment inspector</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <h3 className="text-2xl font-semibold tracking-[-0.03em]">Current URL state</h3>
                    <span className="mono-pill" style={{ borderColor: statusTone.color, color: statusTone.color }}>
                      {statusTone.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">{statusTone.message}</p>
                </div>

                <div className="metric-grid mt-5">
                  <div className="metric-card">
                    <p className="metric-label">Fragment budget</p>
                    <p className="metric-value">{numberFormatter.format(fragmentLength)} / {numberFormatter.format(MAX_FRAGMENT_LENGTH)}</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Codec</p>
                    <p className="metric-value">{parsed.ok ? parsed.envelope.codec : "plain"}</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Artifacts</p>
                    <p className="metric-value">{parsed.ok ? numberFormatter.format(parsed.envelope.artifacts.length) : "0"}</p>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm text-[color:var(--text-muted)]">
                    <span>Size budget</span>
                    <span>{Math.round(budgetRatio * 100)}%</span>
                  </div>
                  <div className="budget-track">
                    <div className="budget-fill" style={{ width: `${budgetRatio * 100}%` }} />
                  </div>
                </div>

                <div className="mt-5 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4">
                  <p className="metric-label">Hash preview</p>
                  <pre className="font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)]">
                    {getHashPreview(hash)}
                  </pre>
                </div>
              </section>
            </div>
          </div>

          <section className="panel panel-strong fade-up overflow-hidden px-5 py-5 sm:px-6" style={getAnimationStyle(260)}>
              <div className="print-hide-on-markdown flex flex-wrap items-start justify-between gap-4 border-b border-[color:var(--border)] pb-5">
              <div>
                <p className="section-kicker">Viewer shell</p>
                <h3 className="font-display mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                  {activeArtifact?.title ?? envelope?.title ?? "Renderer staging area"}
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)]">
                  {activeArtifact
                    ? `${getArtifactSubtitle(activeArtifact)} selected from the decoded fragment. Multiple artifact-specific viewers now render directly in-frame while the shell stays ready for future polish.`
                    : "No artifact is active yet. Choose a sample fragment to populate the payload inspector and viewer metadata."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {artifactKinds.map((kind) => {
                  const Icon = kindIcons[kind];
                  const isCurrent = activeArtifact?.kind === kind;

                  return (
                    <span
                      key={kind}
                      className="mono-pill"
                      style={
                        isCurrent
                          ? {
                              borderColor: "var(--accent-secondary)",
                              color: "var(--accent-secondary)",
                            }
                          : undefined
                      }
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {kind}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-4">
                <div className="viewer-frame">
                  <div className="viewer-head print-hide-on-markdown">
                    <div>
                      <p className="metric-label">Ready for fragment decode</p>
                      <h4 className="mt-2 text-lg font-semibold">Choose a sample payload to populate this shell</h4>
                    </div>
                    <span className="mono-pill">public-safe</span>
                  </div>
                  <div className="artifact-preview">
                    <pre>{parsed.ok ? "" : parsed.message}</pre>
                  </div>
                </div>

                <div className="print-hide-on-markdown grid gap-3 md:grid-cols-3">
                  <div className="metric-card">
                    <p className="metric-label">Security posture</p>
                     <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">Payloads stay in the hash, renderers stay client-side, and artifact-specific viewers can land without changing transport semantics.</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Route model</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">The app remains a single export-friendly route for GitHub Pages and other static hosts.</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Next up</p>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">Markdown, code, diff, CSV, and JSON now share the same viewer shell and fragment contract.</p>
                  </div>
                </div>
            </div>
          </section>
        </section>
        )}
      </div>
    </main>
  );
}
