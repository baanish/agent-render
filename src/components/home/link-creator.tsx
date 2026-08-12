"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { StatusFlag } from "@/components/shell/status-flag";
import { copyTextToClipboard } from "@/lib/copy-text";
import { numberFormatter } from "@/lib/format";
import type {
  GeneratedArtifactLink,
  LinkCreatorDraft,
} from "@/lib/payload/link-creator";
import { artifactKinds, codecs, type ArtifactKind } from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

type LinkCreatorProps = {
  onPreviewHash: (hash: string) => void;
};

const fieldPlaceholders: Record<ArtifactKind, string> = {
  markdown: "# Notes\n\nPaste markdown here.",
  code: 'export function hello() {\n  return "world";\n}',
  diff: 'diff --git a/src/example.ts b/src/example.ts\nindex 1111111..2222222 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-export const value = "old";\n+export const value = "new";\n',
  csv: "name,status\nviewer,ready\ncreator,draft",
  json: '{\n  "status": "ready",\n  "artifacts": 1\n}',
};

const codecOptions = ["auto", ...codecs] as const;

const defaultLinkCreatorDraft: LinkCreatorDraft = {
  kind: "markdown",
  title: "Product brief",
  filename: "brief.md",
  content:
    "# Launch note\n\nShare one artifact at a time without uploading it anywhere.\n\n- Markdown stays readable\n- Code keeps its language hint\n- The link works from a static export",
  language: "tsx",
  diffView: "unified",
  codec: "auto",
};

function getBaseUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
}

function getBodyFieldLabel(kind: ArtifactKind) {
  return kind === "diff" ? "Patch" : "Content";
}

/**
 * Builds shareable fragment links from pasted artifact content in the home empty state flow.
 * Accepts `onPreviewHash` so the parent shell can preview the generated fragment before navigation.
 * Generates links client-side with validation, and exposes inline copy/error/stale-result states.
 */
export function LinkCreator({ onPreviewHash }: LinkCreatorProps) {
  const [{ draft, version: draftVersion }, setDraftState] = useState({
    draft: defaultLinkCreatorDraft,
    version: 0,
  });
  const [generatedLink, setGeneratedLink] =
    useState<GeneratedArtifactLink | null>(null);
  const [generatedVersion, setGeneratedVersion] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [markdownLinkCopyState, setMarkdownLinkCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const generationRequestRef = useRef(0);
  const markdownCopyTokenRef = useRef(0);
  const generatedLinkRef = useRef<GeneratedArtifactLink | null>(null);
  const isGeneratedLinkStale =
    Boolean(generatedLink) && draftVersion !== generatedVersion;
  const contentFieldLabel = getBodyFieldLabel(draft.kind);

  generatedLinkRef.current = generatedLink;

  useEffect(() => {
    setCopyState("idle");
    setMarkdownLinkCopyState("idle");
    setError(null);
  }, [draftVersion]);

  const updateDraft = <K extends keyof LinkCreatorDraft>(
    field: K,
    value: LinkCreatorDraft[K],
  ) => {
    setDraftState((current) => {
      if (Object.is(current.draft[field], value)) {
        return current;
      }

      return {
        draft: {
          ...current.draft,
          [field]: value,
        },
        version: current.version + 1,
      };
    });
  };

  const handleGenerate = async () => {
    const requestId = generationRequestRef.current + 1;
    generationRequestRef.current = requestId;

    try {
      const { createGeneratedArtifactLinkAsync } =
        await import("@/lib/payload/link-creator");
      const nextGeneratedLink = await createGeneratedArtifactLinkAsync(
        draft,
        getBaseUrl(),
      );
      if (generationRequestRef.current !== requestId) {
        return;
      }

      setGeneratedLink(nextGeneratedLink);
      setGeneratedVersion(draftVersion);
      setError(null);
      setCopyState("idle");
      setMarkdownLinkCopyState("idle");
    } catch (generationError) {
      if (generationRequestRef.current !== requestId) {
        return;
      }

      setGeneratedLink(null);
      setGeneratedVersion(-1);
      setCopyState("idle");
      setMarkdownLinkCopyState("idle");
      setError(
        generationError instanceof Error
          ? generationError.message
          : "The link could not be generated.",
      );
    }
  };

  const handleCopy = async () => {
    if (!generatedLink) {
      return;
    }

    try {
      await copyTextToClipboard(generatedLink.url);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const handleCopyMarkdownLink = async () => {
    const link = generatedLinkRef.current;
    if (!link) {
      return;
    }

    const requestToken = ++markdownCopyTokenRef.current;
    const expectedHash = link.hash;

    try {
      await copyTextToClipboard(link.markdownLink);
      if (
        markdownCopyTokenRef.current !== requestToken ||
        generatedLinkRef.current?.hash !== expectedHash
      ) {
        return;
      }
      setMarkdownLinkCopyState("copied");
    } catch {
      if (
        markdownCopyTokenRef.current !== requestToken ||
        generatedLinkRef.current?.hash !== expectedHash
      ) {
        return;
      }
      setMarkdownLinkCopyState("failed");
    }
  };

  const transferName =
    generatedLink?.artifact.filename ||
    generatedLink?.artifact.title ||
    draft.filename.trim() ||
    generatedLink?.envelope.title ||
    generatedLink?.artifact.id;

  return (
    <section className="home-generator-section">
      <div className="home-generator-grid">
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              handleGenerate();
            }}
          >
            <ol className="procedure-list">
              <li className="procedure-step">
                <span className="step-index" aria-hidden="true">
                  1
                </span>
                <div>
                  <h2 className="step-title">Identify</h2>
                  <div
                    className="creator-kind-grid"
                    role="group"
                    aria-label="Artifact kind"
                  >
                    {artifactKinds.map((kind) => {
                      const isActive = draft.kind === kind;

                      return (
                        <button
                          key={kind}
                          type="button"
                          className={cn("creator-kind-card", isActive && "is-active")}
                          aria-pressed={isActive}
                          onClick={() => updateDraft("kind", kind)}
                        >
                          <span className="creator-kind-label">{kind}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="creator-form-grid mt-3">
                    <label className="creator-field">
                      <span className="field-label">Title</span>
                      <input
                        name="title"
                        value={draft.title}
                        onChange={(event) => updateDraft("title", event.target.value)}
                        placeholder="Quarterly update"
                        className="creator-input"
                      />
                    </label>

                    <label className="creator-field">
                      <span className="field-label">Filename</span>
                      <input
                        name="filename"
                        value={draft.filename}
                        onChange={(event) =>
                          updateDraft("filename", event.target.value)
                        }
                        placeholder="update.md"
                        className="creator-input"
                      />
                    </label>

                    {draft.kind === "code" ? (
                      <label className="creator-field">
                        <span className="field-label">Language</span>
                        <input
                          name="language"
                          value={draft.language}
                          onChange={(event) =>
                            updateDraft("language", event.target.value)
                          }
                          placeholder="tsx"
                          className="creator-input"
                        />
                      </label>
                    ) : null}

                    {draft.kind === "diff" ? (
                      <label className="creator-field">
                        <span className="field-label">Diff view</span>
                        <select
                          name="diffView"
                          value={draft.diffView}
                          onChange={(event) =>
                            updateDraft(
                              "diffView",
                              event.target.value as LinkCreatorDraft["diffView"],
                            )
                          }
                          className="creator-input"
                        >
                          <option value="unified">Unified</option>
                          <option value="split">Split</option>
                        </select>
                      </label>
                    ) : null}
                  </div>
                </div>
              </li>

              <li className="procedure-step">
                <span className="step-index" aria-hidden="true">
                  2
                </span>
                <div>
                  <h2 className="step-title">Load</h2>
                  <label className="creator-field">
                    <span className="field-label">{contentFieldLabel}</span>
                    <textarea
                      name="content"
                      value={draft.content}
                      onChange={(event) => updateDraft("content", event.target.value)}
                      placeholder={fieldPlaceholders[draft.kind]}
                      className="creator-textarea"
                      rows={12}
                    />
                  </label>
                </div>
              </li>

              <li className="procedure-step">
                <span className="step-index" aria-hidden="true">
                  3
                </span>
                <div>
                  <h2 className="step-title">Encode</h2>
                  <div className="creator-form-footer">
                    <div
                      className="creator-codec-row"
                      role="group"
                      aria-label="Compression algorithm"
                    >
                      <span className="field-label">Compression</span>
                      {codecOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={cn(
                            "artifact-action",
                            (draft.codec ?? "auto") === option && "is-primary",
                          )}
                          aria-pressed={(draft.codec ?? "auto") === option}
                          onClick={() => updateDraft("codec", option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                    <button type="submit" className="artifact-action is-primary">
                      <Link2 className="h-3.5 w-3.5" />
                      Generate link
                    </button>
                  </div>
                </div>
              </li>
            </ol>
          </form>
        </div>

        <aside className="creator-result-shell">
          <div className="procedure-head">
            <h2 className="procedure-title">Transfer</h2>
            {isGeneratedLinkStale ? (
              <StatusFlag state="hold" label="HOLD" />
            ) : generatedLink ? (
              <StatusFlag state="ready" label="READY" />
            ) : error ? (
              <StatusFlag state="fail" label="FAIL" />
            ) : (
              <StatusFlag state="standby" label="STANDBY" />
            )}
          </div>

          {generatedLink ? (
            <div className={cn("carbon-slip", isGeneratedLinkStale && "is-hold")}>
              <div className="carbon-slip-head">
                <h3 className="carbon-slip-title">{transferName}</h3>
                <span className="carbon-copy-mark">COPY</span>
              </div>

              <div className="creator-link-frame">
                <p className="field-label">URL</p>
                <textarea
                  className="creator-link-output"
                  value={generatedLink.url}
                  readOnly
                  aria-label="Generated agent-render link"
                  rows={5}
                />
              </div>

              <div className="creator-link-frame">
                <p className="field-label">Markdown</p>
                <textarea
                  className="creator-link-output"
                  value={generatedLink.markdownLink}
                  readOnly
                  aria-label="Generated markdown link"
                  rows={3}
                />
              </div>

              <dl className="carbon-legend">
                <div>
                  <dt className="field-label">Codec</dt>
                  <dd className="metric-value">{generatedLink.codec}</dd>
                </div>
                <div>
                  <dt className="field-label">Fragment</dt>
                  <dd className="metric-value">
                    {numberFormatter.format(generatedLink.fragmentLength)} chars
                  </dd>
                </div>
                <div>
                  <dt className="field-label">Markdown length</dt>
                  <dd className="metric-value">
                    {numberFormatter.format(generatedLink.markdownLinkLength)} chars
                  </dd>
                </div>
              </dl>

              {generatedLink.discordMarkdownLinkWarning ? (
                <div className="creator-warning-state" role="status">
                  {generatedLink.discordMarkdownLinkWarning}
                </div>
              ) : null}

              <div className="creator-result-actions">
                <button
                  type="button"
                  className={cn(
                    "artifact-action",
                    copyState === "copied" && "is-primary",
                  )}
                  onClick={handleCopy}
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
                    markdownLinkCopyState === "copied" && "is-primary",
                  )}
                  onClick={handleCopyMarkdownLink}
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
                  onClick={() => onPreviewHash(generatedLink.hash)}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Preview here
                </button>
                <a
                  href={generatedLink.url}
                  target="_blank"
                  rel="noreferrer"
                  className="artifact-action"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
              </div>

              {isGeneratedLinkStale ? (
                <p className="creator-inline-status" role="status">
                  Draft changed since last generation.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="carbon-slot">
              <div className="carbon-empty">No transfer</div>
            </div>
          )}

          {error ? (
            <div className="creator-error-state" role="alert">
              {error}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
