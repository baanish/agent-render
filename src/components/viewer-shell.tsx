"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Download,
  FileCode2,
  FileDiff,
  FileJson2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Printer,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { sampleEnvelopes, sampleLinks } from "@/lib/payload/examples";
import { decodeFragment, decodeFragmentAsync, encodeEnvelope, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { loadArxDictionary } from "@/lib/payload/arx-codec";
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
import { LinkCreator } from "@/components/home/link-creator";
import { ArtifactSelector } from "@/components/viewer/artifact-selector";
import { FragmentDetailsDisclosure } from "@/components/viewer/fragment-details-disclosure";
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

const iconPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`;

const ecosystemLinks = [
  {
    href: "https://github.com/baanish/agent-render",
    kicker: "Source",
    title: "Browse the GitHub repo",
    description: "Inspect the payload format, renderer shell, and deployment notes behind the static viewer.",
  },
  {
    href: "https://clawdhub.com/skills/agent-render-linking",
    kicker: "Ecosystem",
    title: "Use the ClawdHub skill",
    description: "Help OpenClaw agents emit `agent-render` links intentionally across chat surfaces and workflows.",
  },
] as const;

const emptyStateSteps = [
  "Pick a sample fragment to update the hash in place.",
  "The shell decodes the envelope client-side and activates the chosen artifact.",
  "Artifact-specific renderers take over this stage without sending the payload to a server.",
] as const;

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

function getArtifactHeading(artifact: ArtifactPayload): string {
  return artifact.title ?? artifact.filename ?? artifact.id;
}

function getArtifactSupportingLabel(artifact: ArtifactPayload): string {
  return artifact.filename && artifact.filename !== getArtifactHeading(artifact) ? artifact.filename : artifact.id;
}

function getArtifactDetailRows(artifact: ArtifactPayload) {
  const rows = [
    { label: "Kind", value: artifact.kind },
    { label: "Artifact", value: artifact.id },
    { label: "File", value: artifact.filename ?? "Not provided" },
    { label: "Size", value: `${numberFormatter.format(getArtifactBody(artifact).length)} chars` },
  ];

  if (artifact.kind === "code") {
    rows.push({ label: "Language", value: artifact.language ?? "Auto later" });
  }

  if (artifact.kind === "diff") {
    rows.push({ label: "View", value: artifact.view ?? "Unified later" });
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
  const [rendererReady, setRendererReady] = useState(true);

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

  const [dictReady, setDictReady] = useState(false);

  useEffect(() => {
    loadArxDictionary().then(() => setDictReady(true));
  }, []);

  const [parsed, setParsed] = useState<ReturnType<typeof decodeFragment>>(() => decodeFragment(hash));

  useEffect(() => {
    let cancelled = false;
    decodeFragmentAsync(hash).then((result) => {
      if (!cancelled) setParsed(result);
    });
    return () => { cancelled = true; };
  }, [hash, dictReady]);

  const fragmentLength = hash.startsWith("#") ? hash.length - 1 : hash.length;
  const envelope = parsed.ok ? parsed.envelope : null;
  const activeArtifact = envelope ? getActiveArtifact(envelope) : null;
  const markdownArtifact: MarkdownArtifact | null = activeArtifact?.kind === "markdown" ? activeArtifact : null;
  const codeArtifact: CodeArtifact | null = activeArtifact?.kind === "code" ? activeArtifact : null;
  const diffArtifact: DiffArtifact | null = activeArtifact?.kind === "diff" ? activeArtifact : null;
  const csvArtifact: CsvArtifact | null = activeArtifact?.kind === "csv" ? activeArtifact : null;
  const jsonArtifact: JsonArtifact | null = activeArtifact?.kind === "json" ? activeArtifact : null;
  const hasKnownRenderer = Boolean(markdownArtifact || codeArtifact || diffArtifact || csvArtifact || jsonArtifact);
  const budgetRatio = Math.min(fragmentLength / MAX_FRAGMENT_LENGTH, 1);
  const statusTone = getStatusTone(parsed);
  const viewerState = activeArtifact && envelope ? "artifact" : parsed.ok ? "decoded-no-artifact" : parsed.code === "empty" ? "empty" : "error";

  useEffect(() => {
    if (!activeArtifact) {
      setRendererReady(true);
      return;
    }

    setRendererReady(false);
  }, [activeArtifact]);

  useEffect(() => {
    if (activeArtifact && !hasKnownRenderer) {
      setRendererReady(true);
    }
  }, [activeArtifact, hasKnownRenderer]);

  const markRendererReady = useCallback(() => {
    setRendererReady(true);
  }, []);

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

      encodeEnvelopeAsync({ ...envelope, activeArtifactId: artifactId }, { codec: envelope.codec }).then((encoded) => {
        setFragmentHash(`#${encoded}`);
      });
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
    <main
      className="app-shell min-h-screen px-2 pb-5 pt-2.5 sm:px-6 sm:pb-12 sm:pt-5 lg:px-10 lg:pt-7"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3.5 sm:gap-6">
        <header className="panel print-hide-on-markdown fade-up sticky top-2 z-30 flex flex-col gap-2 px-3 py-2.5 sm:top-4 sm:gap-4 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] shadow-[var(--shadow-md)] sm:h-11 sm:w-11">
              <Image src={iconPath} alt="" width={24} height={24} className="h-5 w-5 sm:h-6 sm:w-6" priority unoptimized />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold tracking-[-0.03em] sm:text-2xl">agent-render</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="mono-pill shell-pill">Zero Data Retention by design</span>
            <ThemeToggle />
          </div>
        </header>

        {activeArtifact && envelope ? (
          <section className="artifact-first-layout">
            <section className="panel fade-up print-hide-on-markdown px-2.5 py-2.5 sm:px-5 sm:py-4" style={getAnimationStyle(80)}>
              <div className="artifact-bundle-header">
                <div>
                  <p className="section-kicker">Artifact bundle</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5 sm:mt-2 sm:gap-3">
                    <h2 className="text-xl font-semibold leading-tight tracking-[-0.03em] sm:text-2xl">{envelope.title ?? "Untitled bundle"}</h2>
                    <span className="mono-pill">{envelope.artifacts.length} item{envelope.artifacts.length === 1 ? "" : "s"}</span>
                  </div>
                  <p className="mt-1.5 max-w-3xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-2 sm:leading-6">
                    Selecting an artifact updates the active fragment target while keeping the rendered payload front and center.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono-pill" style={{ borderColor: statusTone.color, color: statusTone.color }}>
                    {statusTone.label}
                  </span>
                  <span className="mono-pill">{numberFormatter.format(fragmentLength)} chars</span>
                </div>
              </div>

              <ArtifactSelector
                artifacts={envelope.artifacts}
                activeArtifactId={activeArtifact.id}
                getHeading={getArtifactHeading}
                getSupportingLabel={getArtifactSupportingLabel}
                kindIcons={kindIcons}
                onSelect={handleArtifactSelect}
              />
            </section>

            <section className="panel panel-strong fade-up overflow-hidden px-2.5 py-2.5 sm:px-5 sm:py-4" style={getAnimationStyle(140)}>
              <div className="artifact-stage-head print-hide-on-markdown">
                <div className="min-w-0">
                  <p className="section-kicker">{getArtifactSubtitle(activeArtifact)}</p>
                  <h3 className="font-display mt-1.5 text-[1.7rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:mt-2 sm:text-4xl sm:leading-tight">
                    {getArtifactHeading(activeArtifact)}
                  </h3>
                  <p className="mt-1.5 max-w-3xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-2 sm:leading-6">
                    {getArtifactSupportingLabel(activeArtifact)}
                  </p>
                </div>

                <div className="viewer-toolbar">
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
                    <pre>{getPreviewText(activeArtifact)}</pre>
                  )}
                </div>
              </div>
            </section>

            <section className="print-hide-on-markdown fade-up" style={getAnimationStyle(200)}>
              <div className="artifact-meta-grid" data-testid="artifact-metadata-grid">
                {getArtifactDetailRows(activeArtifact).map((row) => (
                  <div key={row.label} className="artifact-meta-card">
                    <p className="metric-label">{row.label}</p>
                    <p className="artifact-meta-value">{row.value}</p>
                  </div>
                ))}
              </div>

              <FragmentDetailsDisclosure
                codec={parsed.ok ? parsed.envelope.codec : "plain"}
                fragmentLength={numberFormatter.format(fragmentLength)}
                hashPreview={getHashPreview(hash)}
                maxLength={numberFormatter.format(MAX_FRAGMENT_LENGTH)}
                statusLabel={statusTone.label}
                statusMessage={statusTone.message}
              />
            </section>
          </section>
        ) : (
          <section className="empty-state-layout">
            <section className="home-hero-panel panel panel-hero fade-up px-3 py-3.5 sm:px-8 sm:py-8" style={getAnimationStyle(80)}>
              <div className="grid gap-4 sm:gap-8 xl:grid-cols-[minmax(0,1.14fr)_minmax(19rem,0.86fr)] xl:items-end">
                <div>
                  <p className="section-kicker">Artifact viewer</p>
                  <h2 className="font-display mt-2 max-w-3xl text-[2rem] font-semibold leading-[0.94] tracking-[-0.05em] sm:mt-3 sm:text-5xl sm:leading-none lg:text-6xl">
                    Share artifacts in the URL, keep the server out of the payload.
                  </h2>
                  <p className="mt-3 max-w-2xl text-[0.92rem] leading-[1.55] text-[color:var(--text-muted)] sm:mt-5 sm:text-lg sm:leading-7">
                    agent-render opens markdown, code, diff, CSV, and JSON artifacts from a single static link, so someone can understand the payload without uploading it anywhere.
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-1.5 sm:mt-6 sm:gap-3">
                    <span className="mono-pill">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      fully static export
                    </span>
                    <span className="mono-pill">
                      <Sparkles className="h-3.5 w-3.5" />
                      product-minded shell
                    </span>
                    <span className="mono-pill">
                      <FolderKanban className="h-3.5 w-3.5" />
                      renderer slots ready
                    </span>
                  </div>
                </div>

                <div className="hero-metric-stack">
                  <div className="metric-card">
                    <p className="metric-label">Protocol shape</p>
                    <p className="font-mono mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                      #{PAYLOAD_FRAGMENT_KEY}=v1.&lt;codec&gt;.&lt;payload&gt;
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Why it exists</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                      Agent outputs get flattened in chat. agent-render keeps them readable, portable, and static-host friendly.
                    </p>
                  </div>
                </div>
              </div>

              <div className="hero-callout-row home-hero-callouts mt-3.5 print-hide-on-markdown sm:mt-8">
                {ecosystemLinks.map((link) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="hero-link-card">
                    <span className="hero-link-eyebrow">{link.kicker}</span>
                    <span className="hero-link-title">
                      {link.title}
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-[color:var(--accent-secondary)]" />
                    </span>
                    <p className="hero-link-body">{link.description}</p>
                  </a>
                ))}

                <div className="hero-link-card is-static">
                  <span className="hero-link-eyebrow">How to try it</span>
                  <span className="hero-link-title">Load any sample fragment below</span>
                  <p className="hero-link-body">Pick a sample, update the hash, and the viewer opens without sending the artifact body to the host.</p>
                </div>
              </div>
            </section>

            <LinkCreator onPreviewHash={setFragmentHash} />

            <div className="empty-state-lower-grid home-empty-lower-grid print-hide-on-markdown">
              <section className="home-samples-panel panel fade-up px-3 py-3 sm:px-6 sm:py-5" style={getAnimationStyle(140)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="section-kicker">Example fragments</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">Load a sample envelope</h3>
                  </div>
                  <span className="mono-pill">{sampleCards.length} presets</span>
                </div>
                <p className="mt-2.5 max-w-2xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-6">
                  Each preset uses the same fragment transport as the live product, so you can try the viewer shell with realistic payload sizes and renderer combinations in one click.
                </p>

                <div className="sample-link-grid mt-3 sm:mt-5">
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

              <section className="home-inspector-panel panel fade-up px-3 py-3 sm:px-6 sm:py-5" style={getAnimationStyle(200)}>
                <div>
                  <p className="section-kicker">Fragment inspector</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2.5 sm:mt-2 sm:gap-3">
                    <h3 className="text-xl font-semibold tracking-[-0.03em] sm:text-2xl">Current URL state</h3>
                    <span className="mono-pill" style={{ borderColor: statusTone.color, color: statusTone.color }}>
                      {statusTone.label}
                    </span>
                  </div>
                  <p className="mt-2.5 text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-6">{statusTone.message}</p>
                </div>

                <div className="metric-grid mt-3.5 sm:mt-5">
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

                <div className="mt-3.5 sm:mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm text-[color:var(--text-muted)]">
                    <span>Size budget</span>
                    <span>{Math.round(budgetRatio * 100)}%</span>
                  </div>
                  <div className="budget-track">
                    <div className="budget-fill" style={{ width: `${budgetRatio * 100}%` }} />
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:mt-5 sm:gap-3">
                  <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 sm:p-4">
                    <p className="metric-label">Hash preview</p>
                    <pre className="font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)]">
                      {getHashPreview(hash)}
                    </pre>
                  </div>

                  <div className="metric-card">
                    <p className="metric-label">What happens next</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">
                      Once a fragment is present, the shell decodes the envelope in-browser, selects the active artifact, and swaps this empty state for the renderer-specific stage without changing the route model.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <section className="home-stage-panel panel panel-strong fade-up overflow-hidden px-3 py-3 sm:px-6 sm:py-5" style={getAnimationStyle(260)}>
              <div className="print-hide-on-markdown flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3 sm:gap-4 sm:pb-5">
                <div>
                  <p className="section-kicker">Viewer shell</p>
                  <h3 className="font-display mt-2 text-2xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">
                    {activeArtifact?.title ?? envelope?.title ?? "Renderer staging area"}
                  </h3>
                  <p className="mt-2.5 max-w-3xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-7">
                    {activeArtifact
                      ? `${getArtifactSubtitle(activeArtifact)} selected from the decoded fragment. Multiple artifact-specific viewers now render directly in-frame while the shell stays ready for future polish.`
                      : "This stage becomes the live artifact surface once a fragment is active. The payload stays in the URL hash, the route stays export-friendly, and each artifact kind can render inside the same shell."}
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

              <div className="viewer-shell-empty-grid mt-3 sm:mt-5">
                <div className="viewer-frame viewer-frame-home">
                  <div className="viewer-head print-hide-on-markdown">
                    <div>
                      <p className="metric-label">Ready for fragment decode</p>
                      <h4 className="mt-1.5 text-base font-semibold tracking-[-0.03em] sm:mt-2 sm:text-xl">Choose a sample payload to populate this shell</h4>
                    </div>
                    <span className="mono-pill">public-safe</span>
                  </div>
                  <div className="artifact-preview viewer-empty-preview">
                    <div className="viewer-empty-content">
                      <div>
                        <p className="section-kicker">First-run flow</p>
                        <h4 className="font-display mt-2.5 text-[1.75rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:mt-3 sm:text-[2.35rem] sm:leading-tight">
                          The live renderer stage appears here as soon as a fragment is selected.
                        </h4>
                        <p className="mt-2.5 max-w-2xl text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-4 sm:leading-7">
                          {parsed.ok
                            ? "A decoded fragment is already present, so the active artifact can take over this frame immediately."
                            : parsed.message}
                        </p>
                      </div>

                      <div className="viewer-step-grid">
                        {emptyStateSteps.map((step, index) => (
                          <div key={step} className="metric-card">
                            <p className="metric-label">Step {index + 1}</p>
                            <p className="mt-2.5 text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-7">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="viewer-shell-side-grid print-hide-on-markdown">
                  <div className="metric-card">
                    <p className="metric-label">Security posture</p>
                    <p className="mt-2.5 text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-7">
                      Payloads stay in the hash, renderers stay client-side, and artifact-specific viewers can land without changing fragment transport semantics.
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Route model</p>
                    <p className="mt-2.5 text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-7">
                      The app remains a single export-friendly route for Cloudflare Pages and other static hosts, even as richer artifact viewers plug into the shell.
                    </p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Supported artifacts</p>
                    <p className="mt-2.5 text-sm leading-[1.45rem] text-[color:var(--text-muted)] sm:mt-3 sm:leading-7">
                      Markdown, code, diff, CSV, and JSON all share the same shell contract, so the homepage can explain the product before the first payload ever lands.
                    </p>
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
