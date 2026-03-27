"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
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
import { sampleEnvelopes, sampleLinks } from "@/lib/payload/examples";
import { decodeFragment, decodeFragmentAsync, encodeEnvelope, encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { loadArxDictionary } from "@/lib/payload/arx-codec";
import {
  MAX_FRAGMENT_LENGTH,
  PAYLOAD_FRAGMENT_KEY,
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
  const activeArtifactRef = useRef<ArtifactPayload | null>(null);
  /** Incremented on each copy click so stale async completions cannot overwrite state from a newer request. */
  const artifactCopyTokenRef = useRef(0);

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
  activeArtifactRef.current = activeArtifact;
  const markdownArtifact: MarkdownArtifact | null = activeArtifact?.kind === "markdown" ? activeArtifact : null;
  const codeArtifact: CodeArtifact | null = activeArtifact?.kind === "code" ? activeArtifact : null;
  const diffArtifact: DiffArtifact | null = activeArtifact?.kind === "diff" ? activeArtifact : null;
  const csvArtifact: CsvArtifact | null = activeArtifact?.kind === "csv" ? activeArtifact : null;
  const jsonArtifact: JsonArtifact | null = activeArtifact?.kind === "json" ? activeArtifact : null;
  const hasKnownRenderer = Boolean(markdownArtifact || codeArtifact || diffArtifact || csvArtifact || jsonArtifact);
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
      className="app-shell min-h-screen px-2 pb-5 pt-2.5 sm:px-6 sm:pb-12 sm:pt-5 lg:px-10 lg:pt-7"
      data-testid="viewer-shell"
      data-viewer-state={viewerState}
      data-active-kind={activeArtifact?.kind ?? "none"}
      data-active-artifact-id={activeArtifact?.id ?? "none"}
      data-renderer-ready={rendererReady ? "true" : "false"}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3.5 sm:gap-6">
        <header className="panel print-hide-on-markdown sticky top-2 z-30 flex flex-col gap-2 px-3 py-2.5 sm:top-4 sm:gap-4 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              handleGoHome();
            }}
            className="flex items-center gap-2.5 sm:gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-secondary)] focus-visible:ring-offset-2 rounded-[var(--radius-lg)] -m-1 p-1"
            aria-label="Go to homepage"
          >
            <div className="grid h-9 w-9 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface-strong)] shadow-[var(--shadow-md)] sm:h-11 sm:w-11">
              <Image src={iconPath} alt="" width={24} height={24} className="h-5 w-5 sm:h-6 sm:w-6" priority unoptimized />
            </div>
            <h1 className="font-display text-lg font-semibold tracking-[-0.03em] sm:text-2xl">agent-render</h1>
          </a>

          <ThemeToggle />
        </header>

        {activeArtifact && envelope ? (
          <section className="artifact-first-layout">
            <section className="panel print-hide-on-markdown px-2.5 py-2.5 sm:px-5 sm:py-4">
              <div className="artifact-bundle-header">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold leading-tight tracking-[-0.02em] sm:text-xl">{envelope.title ?? "Untitled bundle"}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="mono-pill" style={{ color: statusTone.color }}>
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

            <section className="panel panel-strong overflow-hidden px-2.5 py-2.5 sm:px-5 sm:py-4">
              <div className="artifact-stage-head print-hide-on-markdown">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-tight tracking-[-0.02em] sm:text-xl">
                    {getArtifactHeading(activeArtifact)}
                  </h3>
                  <p className="mt-1 text-sm text-[color:var(--text-muted)]">
                    {getArtifactSubtitle(activeArtifact)}
                  </p>
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

            <section className="print-hide-on-markdown">
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
            <LinkCreator onPreviewHash={setFragmentHash} />

            <nav className="sample-list print-hide-on-markdown">
              <p className="mb-3 text-sm font-medium text-[color:var(--text-muted)]">Try a sample</p>
              {sampleCards.map((sample) => {
                const Icon = kindIcons[sample.kind];
                const isActive = hash === sample.hash;

                return (
                  <a key={sample.hash} href={sample.hash} className={cn("sample-row", isActive && "is-active")}>
                    <Icon className="h-4 w-4 shrink-0 text-[color:var(--text-soft)]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{sample.title}</span>
                    <span className="font-mono text-xs text-[color:var(--text-soft)]">{sample.kind}</span>
                    <span className="font-mono text-xs text-[color:var(--text-soft)]">{numberFormatter.format(sample.fragmentLength)}</span>
                  </a>
                );
              })}
            </nav>
          </section>
        )}
      </div>
    </main>
  );
}
