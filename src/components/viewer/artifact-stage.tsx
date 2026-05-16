"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
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
  Printer,
} from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { cn } from "@/lib/utils";
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
import { ArtifactSelector } from "@/components/viewer/artifact-selector";
import { FragmentDetailsDisclosure } from "@/components/viewer/fragment-details-disclosure";

type ArtifactStageProps = {
  activeArtifact: ArtifactPayload;
  envelope: PayloadEnvelope;
  fragmentLength: number;
  hash: string;
  onArtifactSelect: (artifactId: string) => void;
  onRendererReady: (readyKey: string) => void;
  rendererReadyKey: string;
  statusTone: {
    color: string;
    label: string;
    message: string;
  };
};

const numberFormatter = new Intl.NumberFormat("en-US");

const kindIcons: Record<ArtifactKind, LucideIcon> = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};
const toolbarAnimationStyle: CSSProperties = { animationDelay: "80ms" };
const selectorAnimationStyle: CSSProperties = { animationDelay: "100ms" };
const contentAnimationStyle: CSSProperties = { animationDelay: "140ms" };
const metadataAnimationStyle: CSSProperties = { animationDelay: "200ms" };

const MarkdownRenderer = dynamic(
  () =>
    import("@/components/renderers/markdown-renderer").then(
      (module) => module.MarkdownRenderer,
    ),
  { ssr: false },
);
const CodeRenderer = dynamic(
  () =>
    import("@/components/renderers/code-renderer").then(
      (module) => module.CodeRenderer,
    ),
  {
    ssr: false,
  },
);
const DiffRenderer = dynamic(
  () =>
    import("@/components/renderers/diff-renderer").then(
      (module) => module.DiffRenderer,
    ),
  {
    ssr: false,
  },
);
const CsvRenderer = dynamic(
  () =>
    import("@/components/renderers/csv-renderer").then(
      (module) => module.CsvRenderer,
    ),
  {
    ssr: false,
  },
);
const JsonRenderer = dynamic(
  () =>
    import("@/components/renderers/json-renderer").then(
      (module) => module.JsonRenderer,
    ),
  { ssr: false },
);

function getArtifactBody(artifact: ArtifactPayload): string {
  if (artifact.kind === "diff") {
    return (
      artifact.patch ??
      `${artifact.oldContent ?? ""}\n---\n${artifact.newContent ?? ""}`
    );
  }

  return artifact.content;
}

function getArtifactSubtitle(artifact: ArtifactPayload): string {
  if (artifact.kind === "markdown") return "Markdown";
  if (artifact.kind === "code") return artifact.language ?? "Code";
  if (artifact.kind === "diff")
    return artifact.view ? `${artifact.view} diff` : "Diff";
  if (artifact.kind === "json") return "JSON";
  if (artifact.kind === "csv") return "CSV";
  return (artifact as ArtifactPayload).kind;
}

function getArtifactHeading(artifact: ArtifactPayload): string {
  return artifact.title ?? artifact.filename ?? artifact.id;
}

function getArtifactSupportingLabel(artifact: ArtifactPayload, heading = getArtifactHeading(artifact)): string {
  return artifact.filename && artifact.filename !== heading
    ? artifact.filename
    : artifact.id;
}

function getArtifactDetailRows(artifact: ArtifactPayload, bodyLength: number) {
  const rows = [
    { label: "Kind", value: artifact.kind },
    { label: "Artifact", value: artifact.id },
    { label: "File", value: artifact.filename ?? "Not provided" },
    {
      label: "Size",
      value: `${numberFormatter.format(bodyLength)} chars`,
    },
  ];

  if (artifact.kind === "code") {
    rows.push({ label: "Language", value: artifact.language ?? "Auto later" });
  }

  if (artifact.kind === "diff") {
    rows.push({ label: "View", value: artifact.view ?? "Unified later" });
  }

  return rows;
}

function getPreviewText(content: string): string {
  return (
    content.trim().slice(0, 960) ||
    "Artifact contents will appear here once a renderer is attached."
  );
}

function getDownloadFilename(artifact: ArtifactPayload): string {
  if (artifact.filename) return artifact.filename;
  if (artifact.kind === "markdown") return `${artifact.id}.md`;
  if (artifact.kind === "csv") return `${artifact.id}.csv`;
  if (artifact.kind === "json") return `${artifact.id}.json`;
  if (artifact.kind === "diff") return `${artifact.id}.patch`;
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

function RawArtifactSource({
  content,
  onReady,
  testId,
}: {
  content: string;
  onReady: () => void;
  testId: string;
}) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <pre className="artifact-raw-source" data-testid={testId}>
      {content}
    </pre>
  );
}

/**
 * Renders the artifact-first viewer branch after the shell has decoded a valid fragment.
 *
 * Keeps toolbar actions, artifact switching, metadata, and heavy renderer wrappers out of the
 * empty-state shell chunk while preserving the same viewer behavior for decoded payloads.
 */
export function ArtifactStage({
  activeArtifact,
  envelope,
  fragmentLength,
  hash,
  onArtifactSelect,
  onRendererReady,
  rendererReadyKey,
  statusTone,
}: ArtifactStageProps) {
  const [artifactCopyState, setArtifactCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const activeArtifactRef = useRef<ArtifactPayload | null>(activeArtifact);
  const activeArtifactBody = useMemo(() => getArtifactBody(activeArtifact), [activeArtifact]);
  const activeArtifactHeading = useMemo(() => getArtifactHeading(activeArtifact), [activeArtifact]);
  const activeArtifactSubtitle = useMemo(() => getArtifactSubtitle(activeArtifact), [activeArtifact]);
  const activeArtifactSupportingLabel = useMemo(
    () => getArtifactSupportingLabel(activeArtifact, activeArtifactHeading),
    [activeArtifact, activeArtifactHeading],
  );
  const artifactDetailRows = useMemo(
    () => getArtifactDetailRows(activeArtifact, activeArtifactBody.length),
    [activeArtifact, activeArtifactBody.length],
  );
  const activeArtifactBodyRef = useRef(activeArtifactBody);
  const artifactCopyTokenRef = useRef(0);
  const markdownArtifact: MarkdownArtifact | null =
    activeArtifact.kind === "markdown" ? activeArtifact : null;
  const codeArtifact: CodeArtifact | null =
    activeArtifact.kind === "code" ? activeArtifact : null;
  const diffArtifact: DiffArtifact | null =
    activeArtifact.kind === "diff" ? activeArtifact : null;
  const csvArtifact: CsvArtifact | null =
    activeArtifact.kind === "csv" ? activeArtifact : null;
  const jsonArtifact: JsonArtifact | null =
    activeArtifact.kind === "json" ? activeArtifact : null;
  const hasRawToggle = Boolean(markdownArtifact || csvArtifact);

  activeArtifactRef.current = activeArtifact;
  activeArtifactBodyRef.current = activeArtifactBody;

  const markActiveRendererReady = useCallback(() => {
    onRendererReady(rendererReadyKey);
  }, [onRendererReady, rendererReadyKey]);

  useEffect(() => {
    setArtifactCopyState("idle");
    setViewMode("rendered");
  }, [activeArtifact.id]);

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

  const handleArtifactCopy = useCallback(async () => {
    const artifact = activeArtifactRef.current;
    if (!artifact) {
      return;
    }

    const requestArtifactId = artifact.id;
    const requestToken = ++artifactCopyTokenRef.current;
    const body = activeArtifactBodyRef.current;

    try {
      await copyTextToClipboard(body);
      if (
        activeArtifactRef.current?.id !== requestArtifactId ||
        artifactCopyTokenRef.current !== requestToken
      ) {
        return;
      }
      setArtifactCopyState("copied");
    } catch {
      if (
        activeArtifactRef.current?.id !== requestArtifactId ||
        artifactCopyTokenRef.current !== requestToken
      ) {
        return;
      }
      setArtifactCopyState("failed");
    }
  }, []);

  const handleArtifactDownload = useCallback(() => {
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

    const blob = new Blob([activeArtifactBody], {
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
  }, [activeArtifact, activeArtifactBody]);

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
    <section className="artifact-first-layout">
      <div
        className="artifact-toolbar-bar fade-up print-hide-on-markdown"
        style={toolbarAnimationStyle}
      >
        <div className="artifact-toolbar-left">
          <span
            className="mono-pill"
            style={{ borderColor: statusTone.color, color: statusTone.color }}
          >
            {statusTone.label}
          </span>
          <span className="font-mono text-xs text-[color:var(--text-soft)]">
            {activeArtifactSupportingLabel}
          </span>
          <span className="font-mono text-xs text-[color:var(--text-soft)]">
            {numberFormatter.format(fragmentLength)} chars
          </span>
        </div>
        <div className="viewer-toolbar">
          <button
            type="button"
            className={cn(
              "artifact-action",
              artifactCopyState === "copied" && "is-primary",
            )}
            onClick={handleArtifactCopy}
          >
            {artifactCopyState === "copied" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {artifactCopyState === "copied"
              ? "Copied"
              : artifactCopyState === "failed"
                ? "Copy failed"
                : "Copy"}
          </button>
          {markdownArtifact && viewMode === "rendered" ? (
            <button
              type="button"
              className="artifact-action"
              onClick={handleMarkdownPrint}
            >
              <Printer className="h-3.5 w-3.5" />
              Print
            </button>
          ) : null}
          {hasRawToggle ? (
            <div className="diff-view-toggle">
              <button
                type="button"
                className={cn(
                  "artifact-action",
                  viewMode === "rendered" && "is-primary",
                )}
                onClick={() => setViewMode("rendered")}
              >
                <Eye className="h-3.5 w-3.5" />
                Rendered
              </button>
              <button
                type="button"
                className={cn(
                  "artifact-action",
                  viewMode === "raw" && "is-primary",
                )}
                onClick={() => setViewMode("raw")}
              >
                <Code className="h-3.5 w-3.5" />
                Raw
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="artifact-action is-primary"
            onClick={handleArtifactDownload}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
      </div>

      {envelope.artifacts.length > 1 ? (
        <section
          className="print-hide-on-markdown fade-up"
          style={selectorAnimationStyle}
        >
          <ArtifactSelector
            artifacts={envelope.artifacts}
            activeArtifactId={activeArtifact.id}
            getHeading={getArtifactHeading}
            getSupportingLabel={getArtifactSupportingLabel}
            kindIcons={kindIcons}
            onSelect={onArtifactSelect}
          />
        </section>
      ) : null}

      <section
        className="artifact-content-section fade-up"
        style={contentAnimationStyle}
      >
        <div className="print-hide-on-markdown">
          <p className="section-kicker">
            {activeArtifactSubtitle}
          </p>
          <h3 className="font-display mt-3 text-[2.2rem] font-bold leading-[0.96] tracking-[-0.04em] sm:mt-4 sm:text-[3rem] lg:text-[3.5rem] lg:leading-[0.94]">
            {activeArtifactHeading}
          </h3>
        </div>

        <div className="viewer-frame viewer-frame-primary mt-6 sm:mt-10">
          <div
            className={cn(
              "artifact-preview",
              markdownArtifact &&
                viewMode === "rendered" &&
                "is-markdown print-markdown-target",
            )}
          >
            {markdownArtifact && viewMode === "raw" ? (
              <RawArtifactSource
                content={markdownArtifact.content}
                onReady={markActiveRendererReady}
                testId="renderer-markdown-raw"
              />
            ) : markdownArtifact ? (
              <MarkdownRenderer
                artifact={markdownArtifact}
                onReady={markActiveRendererReady}
              />
            ) : codeArtifact ? (
              <CodeRenderer artifact={codeArtifact} onReady={markActiveRendererReady} />
            ) : diffArtifact ? (
              <DiffRenderer artifact={diffArtifact} onReady={markActiveRendererReady} />
            ) : csvArtifact && viewMode === "raw" ? (
              <RawArtifactSource
                content={csvArtifact.content}
                onReady={markActiveRendererReady}
                testId="renderer-csv-raw"
              />
            ) : csvArtifact ? (
              <CsvRenderer artifact={csvArtifact} onReady={markActiveRendererReady} />
            ) : jsonArtifact ? (
              <JsonRenderer artifact={jsonArtifact} onReady={markActiveRendererReady} />
            ) : (
              <pre>{getPreviewText(activeArtifactBody)}</pre>
            )}
          </div>
        </div>
      </section>

      <section
        className="print-hide-on-markdown fade-up"
        style={metadataAnimationStyle}
      >
        <div
          className="bento-grid bento-grid-compact"
          data-testid="artifact-metadata-grid"
        >
          {artifactDetailRows.map((row) => (
            <div
              key={row.label}
              className="bento-card px-5 py-5 sm:px-6 sm:py-6"
            >
              <p className="metric-label">{row.label}</p>
              <p className="artifact-meta-value">{row.value}</p>
            </div>
          ))}
        </div>

        <FragmentDetailsDisclosure
          codec={envelope.codec}
          fragmentLength={numberFormatter.format(fragmentLength)}
          hashPreview={getHashPreview(hash)}
          maxLength={numberFormatter.format(MAX_FRAGMENT_LENGTH)}
          statusLabel={statusTone.label}
          statusMessage={statusTone.message}
        />
      </section>
    </section>
  );
}
