"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  Check,
  Code,
  Copy,
  Download,
  Eye,
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
import { copyTextToClipboard } from "@/lib/copy-text";
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
    title: "GitHub",
    description: "Source code, payload format, and deployment docs.",
  },
  {
    href: "https://clawdhub.com/skills/agent-render-linking",
    kicker: "Ecosystem",
    title: "ClawdHub skill",
    description: "Let OpenClaw agents generate agent-render links in chat.",
  },
] as const;

const emptyStateSteps = [
  "Pick a sample fragment below.",
  "The payload decodes client-side from the URL hash.",
  "The renderer displays the artifact without contacting a server.",
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
    return "Markdown";
  }

  if (artifact.kind === "code") {
    return artifact.language ?? "Code";
  }

  if (artifact.kind === "diff") {
    return artifact.view ? `${artifact.view} diff` : "Diff";
  }

  if (artifact.kind === "json") {
    return "JSON";
  }

  if (artifact.kind === "csv") {
    return "CSV";
  }

  return (artifact as ArtifactPayload).kind;
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
      message: "Fragment decoded successfully.",
    };
  }

  if (parsed.code === "empty") {
    return {
      label: "Empty",
      color: "var(--accent-secondary)",
      message: parsed.message,
    };
  }

  return {
    label: "Error",
    color: "var(--danger)",
    message: parsed.message,
  };
}

function getAnimationStyle(delay: number): CSSProperties {
  return { animationDelay: `${delay}ms` };
}

/**
 * Render the main viewer shell for decoding and displaying artifact fragments from the URL hash.
 *
 * Manages fragment decoding and ARX dictionary loading, synchronizes component state with the browser hash,
 * and provides UI and handlers for selecting, copying, downloading, printing, and navigating artifacts or clearing the fragment.
 *
 * @returns The root React element for the viewer shell UI
 */
export function ViewerShell() {
  const [hash, setHash] = useState("");
  const [rendererReady, setRendererReady] = useState(true);
  const [artifactCopyState, setArtifactCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const activeArtifactRef = useRef<ArtifactPayload | null>(null);
  /** Incremented on each copy click so stale async completions cannot overwrite state from a newer request. */
  const artifactCopyTokenRef = useRef(0);
  /** True when the current hash originated from a server-injected payload (self-hosted UUID mode). */
  const injectedPayloadRef = useRef(false);

  useEffect(() => {
    // Self-hosted UUID mode: the server injects the payload string into the page.
    // When present, use it as the initial hash source instead of the URL fragment
    // so the existing decode → render pipeline works without changes.
    const injected = (window as unknown as Record<string, unknown>).__AGENT_RENDER_PAYLOAD__;
    if (typeof injected === "string" && injected.length > 0) {
      delete (window as unknown as Record<string, unknown>).__AGENT_RENDER_PAYLOAD__;
      injectedPayloadRef.current = true;
      setHash(`#${injected}`);
    }

    const syncHash = () => {
      injectedPayloadRef.current = false;
      setHash(window.location.hash);
    };

    // Still register the hashchange listener even when an injected payload was
    // consumed so that subsequent navigation (sample links, back/forward, manual
    // URL edits) continues to work.
    if (typeof injected !== "string" || injected.length === 0) {
      syncHash();
    }
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
    const options = injectedPayloadRef.current ? { skipFragmentBudget: true } : undefined;
    decodeFragmentAsync(hash, options).then((result) => {
      if (!cancelled) setParsed(result);
    });
    return () => { cancelled = true; };
  }, [hash, dictReady]);

  const fragmentLength = hash.startsWith("#") ? hash.length - 1 : hash.length;
  const envelope = parsed.ok ? parsed.envelope : null;
  const activeArtifact = envelope ? getActiveArtifact(envelope) : null;

  useEffect(() => {
    const title = activeArtifact?.title?.trim() || envelope?.title?.trim();
    document.title = title ? `${title} — agent-render` : "agent-render";
  }, [envelope, activeArtifact]);
  activeArtifactRef.current = activeArtifact;
  const markdownArtifact: MarkdownArtifact | null = activeArtifact?.kind === "markdown" ? activeArtifact : null;
  const codeArtifact: CodeArtifact | null = activeArtifact?.kind === "code" ? activeArtifact : null;
  const diffArtifact: DiffArtifact | null = activeArtifact?.kind === "diff" ? activeArtifact : null;
  const csvArtifact: CsvArtifact | null = activeArtifact?.kind === "csv" ? activeArtifact : null;
  const jsonArtifact: JsonArtifact | null = activeArtifact?.kind === "json" ? activeArtifact : null;
  const hasKnownRenderer = Boolean(markdownArtifact || codeArtifact || diffArtifact || csvArtifact || jsonArtifact);
  const hasRawToggle = Boolean(markdownArtifact || csvArtifact);
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

  useEffect(() => {
    setArtifactCopyState("idle");
    setViewMode("rendered");
  }, [activeArtifact?.id]);

  useEffect(() => {
    if (artifactCopyState !== "copied" && artifactCopyState !== "failed") {
      return;
    }

    const timer = window.setTimeout(() => {
      setArtifactCopyState("idle");
    }, 2000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [artifactCopyState]);

  const setFragmentHash = useCallback((nextHash: string) => {
    if (window.location.hash === nextHash) {
      return;
    }

    window.history.replaceState(null, "", nextHash);
    setHash(nextHash);
  }, []);

  const handleGoHome = useCallback(() => {
    const url = window.location.pathname + (window.location.search || "");
    window.history.replaceState(null, "", url);
    setHash("");
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

  const handleArtifactCopy = useCallback(async () => {
    const artifact = activeArtifactRef.current;
    if (!artifact) {
      return;
    }

    const requestArtifactId = artifact.id;
    const requestToken = ++artifactCopyTokenRef.current;
    const body = getArtifactBody(artifact);

    try {
      await copyTextToClipboard(body);
      if (activeArtifactRef.current?.id !== requestArtifactId || artifactCopyTokenRef.current !== requestToken) {
        return;
      }
      setArtifactCopyState("copied");
    } catch {
      if (activeArtifactRef.current?.id !== requestArtifactId || artifactCopyTokenRef.current !== requestToken) {
        return;
      }
      setArtifactCopyState("failed");
    }
  }, []);

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
      className="app-shell min-h-screen"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <header className="nav-bar print-hide-on-markdown fade-up sticky top-0 z-30 flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 lg:px-12">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            handleGoHome();
          }}
          className="flex items-center gap-2.5 sm:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2 rounded-[var(--radius-lg)] -m-1 p-1"
          aria-label="Go to homepage"
        >
          <div className="grid h-8 w-8 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] sm:h-9 sm:w-9">
            <Image src={iconPath} alt="" width={24} height={24} className="h-4.5 w-4.5 sm:h-5 sm:w-5" priority unoptimized />
          </div>
          <h1 className="font-display text-lg font-semibold tracking-[-0.03em] sm:text-xl">Agent Render</h1>
        </a>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/security" className="nav-text-link">
            Security
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-12 pt-6 sm:gap-16 sm:px-8 sm:pb-24 sm:pt-12 lg:gap-20 lg:px-12 lg:pt-16">

        {activeArtifact && envelope ? (
          <section className="artifact-first-layout">
            {/* ── Compact file-info toolbar ── */}
            <div className="artifact-toolbar-bar fade-up print-hide-on-markdown" style={getAnimationStyle(80)}>
              <div className="artifact-toolbar-left">
                <span className="mono-pill" style={{ borderColor: statusTone.color, color: statusTone.color }}>
                  {statusTone.label}
                </span>
                <span className="font-mono text-xs text-[color:var(--text-soft)]">{getArtifactSupportingLabel(activeArtifact)}</span>
                <span className="font-mono text-xs text-[color:var(--text-soft)]">{numberFormatter.format(fragmentLength)} chars</span>
              </div>
              <div className="viewer-toolbar">
                <button
                  type="button"
                  className={cn("artifact-action", artifactCopyState === "copied" && "is-primary")}
                  onClick={handleArtifactCopy}
                >
                  {artifactCopyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {artifactCopyState === "copied" ? "Copied" : artifactCopyState === "failed" ? "Copy failed" : "Copy"}
                </button>
                {markdownArtifact && viewMode === "rendered" ? (
                  <button type="button" className="artifact-action" onClick={handleMarkdownPrint}>
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </button>
                ) : null}
                {hasRawToggle ? (
                  <div className="diff-view-toggle">
                    <button type="button" className={cn("artifact-action", viewMode === "rendered" && "is-primary")} onClick={() => setViewMode("rendered")}>
                      <Eye className="h-3.5 w-3.5" />
                      Rendered
                    </button>
                    <button type="button" className={cn("artifact-action", viewMode === "raw" && "is-primary")} onClick={() => setViewMode("raw")}>
                      <Code className="h-3.5 w-3.5" />
                      Raw
                    </button>
                  </div>
                ) : null}
                <button type="button" className="artifact-action is-primary" onClick={handleArtifactDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
              </div>
            </div>

            {/* ── Artifact selector (when multi-artifact) ── */}
            {envelope.artifacts.length > 1 ? (
              <section className="print-hide-on-markdown fade-up" style={getAnimationStyle(100)}>
                <ArtifactSelector
                  artifacts={envelope.artifacts}
                  activeArtifactId={activeArtifact.id}
                  getHeading={getArtifactHeading}
                  getSupportingLabel={getArtifactSupportingLabel}
                  kindIcons={kindIcons}
                  onSelect={handleArtifactSelect}
                />
              </section>
            ) : null}

            {/* ── Editorial artifact heading + content ── */}
            <section className="artifact-content-section fade-up" style={getAnimationStyle(140)}>
              <div className="print-hide-on-markdown">
                <p className="section-kicker">{getArtifactSubtitle(activeArtifact)}</p>
                <h3 className="font-display mt-3 text-[2.2rem] font-bold leading-[0.96] tracking-[-0.04em] sm:mt-4 sm:text-[3rem] lg:text-[3.5rem] lg:leading-[0.94]">
                  {getArtifactHeading(activeArtifact)}
                </h3>
              </div>

              <div className="viewer-frame viewer-frame-primary mt-6 sm:mt-10">
                <div className={cn("artifact-preview", markdownArtifact && viewMode === "rendered" && "is-markdown print-markdown-target")}>
                  {markdownArtifact && viewMode === "raw" ? (
                    <CodeRenderer artifact={{ ...markdownArtifact, kind: "code", language: "markdown" }} onReady={markRendererReady} />
                  ) : markdownArtifact ? (
                    <MarkdownRenderer artifact={markdownArtifact} onReady={markRendererReady} />
                  ) : codeArtifact ? (
                    <CodeRenderer artifact={codeArtifact} onReady={markRendererReady} />
                  ) : diffArtifact ? (
                    <DiffRenderer artifact={diffArtifact} onReady={markRendererReady} />
                  ) : csvArtifact && viewMode === "raw" ? (
                    <CodeRenderer artifact={{ ...csvArtifact, kind: "code", language: "textile" }} onReady={markRendererReady} />
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

            {/* ── Metadata bento ── */}
            <section className="print-hide-on-markdown fade-up" style={getAnimationStyle(200)}>
              <div className="bento-grid bento-grid-compact" data-testid="artifact-metadata-grid">
                {getArtifactDetailRows(activeArtifact).map((row) => (
                  <div key={row.label} className="bento-card px-5 py-5 sm:px-6 sm:py-6">
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
            {/* ── Editorial hero ── */}
            <section className="home-hero-section fade-up" style={getAnimationStyle(80)}>
              <p className="section-kicker">Artifact viewer</p>
              <h2 className="font-display mt-4 max-w-4xl text-[2.5rem] font-bold leading-[0.92] tracking-[-0.04em] sm:mt-6 sm:text-6xl sm:leading-[0.92] lg:text-[4.5rem]">
                Share artifacts in the URL, keep the server out of the payload.
              </h2>
              <p className="mt-5 max-w-2xl text-base leading-[1.7] text-[color:var(--text-muted)] sm:mt-8 sm:text-lg sm:leading-8">
                View markdown, code, diffs, CSV, and JSON from a single static link. Nothing leaves the browser.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 sm:mt-10 sm:gap-3">
                <span className="mono-pill">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  static export
                </span>
                <span className="mono-pill">
                  <Sparkles className="h-3.5 w-3.5" />
                  5 renderers
                </span>
                <span className="mono-pill">
                  <FolderKanban className="h-3.5 w-3.5" />
                  zero retention
                </span>
              </div>
            </section>

            {/* ── Bento feature grid ── */}
            <section className="bento-grid fade-up" style={getAnimationStyle(120)}>
              <div className="bento-card bento-wide px-5 py-6 sm:px-8 sm:py-8">
                <p className="section-kicker">Protocol shape</p>
                <p className="font-mono mt-4 text-base leading-8 text-[color:var(--text-muted)] sm:text-lg">
                  #{PAYLOAD_FRAGMENT_KEY}=v1.&lt;codec&gt;.&lt;payload&gt;
                </p>
              </div>
              <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                <p className="section-kicker">Why</p>
                <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                  Agent outputs get flattened in chat. This keeps them readable and portable.
                </p>
              </div>
              {ecosystemLinks.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="bento-card bento-link px-5 py-6 sm:px-8 sm:py-8">
                  <span className="hero-link-eyebrow">{link.kicker}</span>
                  <span className="hero-link-title">
                    {link.title}
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-[color:var(--accent)]" />
                  </span>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">{link.description}</p>
                </a>
              ))}
              <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                <span className="hero-link-eyebrow">Try it</span>
                <span className="mt-3 block text-base font-semibold leading-6">Load a sample below</span>
                <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)]">Click any sample to populate the viewer from the URL hash.</p>
              </div>
            </section>

            {/* ── Link creator ── */}
            <LinkCreator onPreviewHash={setFragmentHash} />

            {/* ── Samples + Inspector — full-bleed sections ── */}
            <section className="home-samples-section fade-up" style={getAnimationStyle(180)}>
              <div className="section-header">
                <div>
                  <p className="section-kicker">Example fragments</p>
                  <h3 className="font-display mt-3 text-2xl font-bold tracking-[-0.03em] sm:mt-4 sm:text-4xl">Load a sample envelope</h3>
                </div>
                <span className="mono-pill">{sampleCards.length} presets</span>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)] sm:mt-5 sm:text-base sm:leading-8">
                Click any sample to open it in the viewer. Same encoding as production links.
              </p>

              <div className="sample-link-grid mt-6 sm:mt-8">
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
                        <h4 className="mt-3 text-base font-semibold leading-6 sm:text-lg">{sample.title}</h4>
                        <p className="mt-1.5 text-sm leading-7 text-[color:var(--text-muted)]">
                          {sample.description ?? `${sample.envelope.artifacts.length} artifact${sample.envelope.artifacts.length === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                    </a>
                  );
                })}
              </div>
            </section>

            <section className="home-inspector-section fade-up print-hide-on-markdown" style={getAnimationStyle(220)}>
              <div className="section-header">
                <div>
                  <p className="section-kicker">Fragment inspector</p>
                  <h3 className="font-display mt-3 text-2xl font-bold tracking-[-0.03em] sm:mt-4 sm:text-4xl">Current URL state</h3>
                </div>
                <span className="mono-pill" style={{ borderColor: statusTone.color, color: statusTone.color }}>
                  {statusTone.label}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">{statusTone.message}</p>

              <div className="bento-grid mt-6 sm:mt-8">
                <div className="bento-card px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Fragment budget</p>
                  <p className="metric-value">{numberFormatter.format(fragmentLength)} / {numberFormatter.format(MAX_FRAGMENT_LENGTH)}</p>
                  <div className="budget-track mt-4">
                    <div className="budget-fill" style={{ width: `${budgetRatio * 100}%` }} />
                  </div>
                </div>
                <div className="bento-card px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Codec</p>
                  <p className="metric-value">{parsed.ok ? parsed.envelope.codec : "plain"}</p>
                </div>
                <div className="bento-card px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Artifacts</p>
                  <p className="metric-value">{parsed.ok ? numberFormatter.format(parsed.envelope.artifacts.length) : "0"}</p>
                </div>
                <div className="bento-card bento-wide px-5 py-5 sm:px-6 sm:py-6">
                  <p className="metric-label">Hash preview</p>
                  <pre className="font-mono mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs leading-6 text-[color:var(--text-muted)] sm:text-sm">
                    {getHashPreview(hash)}
                  </pre>
                </div>
              </div>
            </section>

            {/* ── Initialize section ── */}
            <section className="home-stage-section fade-up" style={getAnimationStyle(260)}>
              <div className="section-header print-hide-on-markdown">
                <div>
                  <p className="section-kicker">Viewer shell</p>
                  <h3 className="font-display mt-3 text-2xl font-bold leading-tight tracking-[-0.04em] sm:mt-4 sm:text-4xl lg:text-5xl">
                    {activeArtifact?.title ?? envelope?.title ?? "Initialize your Artifact"}
                  </h3>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-[color:var(--text-muted)] sm:mt-5 sm:text-base sm:leading-8">
                    {activeArtifact
                      ? `${getArtifactSubtitle(activeArtifact)} selected.`
                      : "Select a fragment above to render it here. Everything stays in the URL."}
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
                                borderColor: "var(--accent)",
                                color: "var(--accent)",
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

              <div className="bento-grid mt-8 sm:mt-10">
                <div className="bento-card bento-wide px-5 py-6 sm:px-8 sm:py-8">
                  <p className="section-kicker">Getting started</p>
                  <h4 className="font-display mt-3 text-xl font-bold leading-tight tracking-[-0.03em] sm:mt-4 sm:text-2xl lg:text-3xl">
                    Pick a sample or paste your own content above.
                  </h4>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)] sm:mt-4 sm:text-base sm:leading-8">
                    {parsed.ok
                      ? "Fragment decoded — select an artifact to render it."
                      : "No fragment in the URL yet."}
                  </p>
                </div>
                {emptyStateSteps.map((step, index) => (
                  <div key={step} className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                    <p className="section-kicker">Step {index + 1}</p>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">{step}</p>
                  </div>
                ))}
                <Link href="/security" className="bento-card bento-link px-5 py-6 sm:px-8 sm:py-8">
                  <p className="section-kicker">Security</p>
                  <span className="mt-3 block text-base font-semibold leading-6">Read the security page</span>
                  <p className="mt-2 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                    The payload never leaves the URL hash. Rendering is entirely client-side.
                  </p>
                </Link>
                <div className="bento-card px-5 py-6 sm:px-8 sm:py-8">
                  <p className="section-kicker">Hosting</p>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)] sm:text-base sm:leading-8">
                    Single static route. Works on any static host.
                  </p>
                </div>
              </div>
            </section>
          </section>
        )}

        <footer className="site-footer print-hide-on-markdown">
          <span>agent-render</span>
          <Link href="/security">Security</Link>
        </footer>
      </div>
    </main>
  );
}
