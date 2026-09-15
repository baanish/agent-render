"use client";

import { ArrowUpRight, Check, Copy, ExternalLink, Link2 } from "lucide-react";
import type { Ref } from "react";
import { numberFormatter } from "@/lib/format";
import type { GeneratedArtifactLink } from "@/lib/payload/link-creator";
import {
  codecPickerLabel,
  codecs,
  isDeprecatedEmitCodec,
} from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

const codecOptions = ["auto", ...codecs] as const;

export type CodecChoice = (typeof codecOptions)[number];

type CodecPickerProps = {
  value: string | undefined;
  onSelect: (codec: CodecChoice) => void;
  label?: string;
};

/**
 * Shared compression-codec key row used by the link creator and the in-viewer
 * artifact editor. Deprecated emit codecs render with a warning style.
 */
export function CodecPicker({ value, onSelect, label }: CodecPickerProps) {
  const active = value ?? "auto";

  return (
    <div
      className="creator-codec-row"
      role="group"
      aria-label="Compression algorithm"
    >
      {label ? <span className="metric-label">{label}</span> : null}
      {codecOptions.map((option) => (
        <button
          key={option}
          type="button"
          className={cn(
            "artifact-action codec-key",
            active === option && "is-depressed",
            isDeprecatedEmitCodec(option) && "is-deprecated",
          )}
          aria-pressed={active === option}
          title={
            isDeprecatedEmitCodec(option)
              ? "Deprecated: Discord and WhatsApp detonate these Unicode wires. Use auto or arx5."
              : undefined
          }
          onClick={() => onSelect(option)}
        >
          {codecPickerLabel(option)}
        </button>
      ))}
    </div>
  );
}

type GeneratedLinkResultProps = {
  link: GeneratedArtifactLink;
  stale: boolean;
  copyState: "idle" | "copied" | "failed";
  markdownLinkCopyState: "idle" | "copied" | "failed";
  onCopy: () => void;
  onCopyMarkdownLink: () => void;
  onPreview: () => void;
  /** Editor variant: disables the result actions once the draft moves on. */
  disableActionsWhenStale?: boolean;
  /** Creator variant: also lists markdown-link length and bundle title. */
  extendedMetrics?: boolean;
  as?: "section" | "aside";
  containerRef?: Ref<HTMLElement>;
  testId?: string;
};

/**
 * Shared generated-link result panel: the URL and markdown link outputs,
 * codec/fragment metrics, and the copy/preview/open actions used by both the
 * home link creator and the artifact editor.
 */
export function GeneratedLinkResult({
  link,
  stale,
  copyState,
  markdownLinkCopyState,
  onCopy,
  onCopyMarkdownLink,
  onPreview,
  disableActionsWhenStale = false,
  extendedMetrics = false,
  as: Element = "section",
  containerRef,
  testId,
}: GeneratedLinkResultProps) {
  const actionsDisabled = disableActionsWhenStale && stale;

  return (
    <Element
      ref={containerRef}
      className="creator-result-shell carbon-output"
      data-testid={testId}
    >
      <header className="creator-result-head">
        <div>
          <h3>Generated link</h3>
          <p>{link.artifact.filename?.trim() || link.artifact.title || ""}</p>
        </div>
        <span className="carbon-stamp">TRANSFER OK</span>
      </header>

      <div className="carbon-fields">
        <label className="creator-link-frame">
          <span className="metric-label">URL</span>
          <textarea
            className="creator-link-output"
            value={link.url}
            readOnly
            aria-label="Generated agent-render link"
            rows={extendedMetrics ? 5 : 4}
          />
        </label>

        <label className="creator-link-frame">
          <span className="metric-label">Markdown link</span>
          <textarea
            className="creator-link-output"
            value={link.markdownLink}
            readOnly
            aria-label="Generated markdown link"
            rows={3}
          />
        </label>
      </div>

      <dl className="creator-result-metrics">
        <div>
          <dt>CODEC</dt>
          <dd>{link.codec}</dd>
        </div>
        <div>
          <dt>FRAGMENT</dt>
          <dd>{numberFormatter.format(link.fragmentLength)} chars</dd>
        </div>
        {extendedMetrics ? (
          <>
            <div>
              <dt>MARKDOWN LINK</dt>
              <dd>{numberFormatter.format(link.markdownLinkLength)} chars</dd>
            </div>
            <div>
              <dt>BUNDLE</dt>
              <dd>{link.envelope.title}</dd>
            </div>
          </>
        ) : null}
      </dl>

      {link.discordMarkdownLinkWarning ? (
        <div className="creator-warning-state" role="status">
          {link.discordMarkdownLinkWarning}
        </div>
      ) : null}

      <div className="creator-result-actions">
        <button
          type="button"
          className={cn(
            "artifact-action",
            copyState === "copied" && "is-confirmed",
          )}
          disabled={actionsDisabled}
          onClick={onCopy}
        >
          {copyState === "copied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copyState === "copied"
            ? "Copied"
            : copyState === "failed"
              ? "Copy failed"
              : "Copy link"}
        </button>
        <button
          type="button"
          className={cn(
            "artifact-action",
            markdownLinkCopyState === "copied" && "is-confirmed",
          )}
          disabled={actionsDisabled}
          onClick={onCopyMarkdownLink}
        >
          {markdownLinkCopyState === "copied" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Link2 className="h-3.5 w-3.5" />
          )}
          {markdownLinkCopyState === "copied"
            ? "Copied"
            : markdownLinkCopyState === "failed"
              ? "Copy failed"
              : "Copy markdown link"}
        </button>
        <button
          type="button"
          className="artifact-action"
          disabled={actionsDisabled}
          onClick={onPreview}
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
          Preview here
        </button>
        <a
          href={actionsDisabled ? undefined : link.url}
          target="_blank"
          rel="noreferrer"
          className="artifact-action"
          aria-disabled={actionsDisabled || undefined}
          onClick={(event) => {
            if (actionsDisabled) {
              event.preventDefault();
            }
          }}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in new tab
        </a>
      </div>

      {stale ? (
        <p className="creator-inline-status" role="status">
          Draft changed since last generation.
        </p>
      ) : null}
    </Element>
  );
}
