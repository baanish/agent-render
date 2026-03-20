"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Check, Copy, ExternalLink, FileCode2, FileDiff, FileJson2, FileSpreadsheet, FileText, Link2 } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-text";
import { createGeneratedArtifactLinkAsync, defaultLinkCreatorDraft, getBodyFieldLabel, type GeneratedArtifactLink, type LinkCreatorDraft } from "@/lib/payload/link-creator";
import { artifactKinds, codecs, type ArtifactKind } from "@/lib/payload/schema";
import { cn } from "@/lib/utils";

type LinkCreatorProps = {
  onPreviewHash: (hash: string) => void;
};

const kindIcons: Record<ArtifactKind, LucideIcon> = {
  markdown: FileText,
  code: FileCode2,
  diff: FileDiff,
  csv: FileSpreadsheet,
  json: FileJson2,
};

const fieldHints: Record<ArtifactKind, string> = {
  markdown: "Paste markdown notes, release docs, or a spec excerpt.",
  code: "Paste a code snippet and add a language hint when it helps.",
  diff: "Paste a unified git patch to open the review-style diff renderer.",
  csv: "Paste raw CSV and the table renderer will take it from there.",
  json: "Paste formatted or compact JSON for a tree and raw-code preview.",
};

const fieldPlaceholders: Record<ArtifactKind, string> = {
  markdown: "# Notes\n\nPaste markdown here.",
  code: "export function hello() {\n  return \"world\";\n}",
  diff: "diff --git a/src/example.ts b/src/example.ts\nindex 1111111..2222222 100644\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-export const value = \"old\";\n+export const value = \"new\";\n",
  csv: "name,status\nviewer,ready\ncreator,draft",
  json: '{\n  "status": "ready",\n  "artifacts": 1\n}',
};

function getBaseUrl() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const url = new URL(window.location.href);
  url.hash = "";
  return url.toString();
}

function getDraftSignature(draft: LinkCreatorDraft) {
  return JSON.stringify(draft);
}

/**
 * Builds shareable fragment links from pasted artifact content in the home empty state flow.
 * Accepts `onPreviewHash` so the parent shell can preview the generated fragment before navigation.
 * Generates links client-side with validation, and exposes inline copy/error/stale-result states.
 */
export function LinkCreator({ onPreviewHash }: LinkCreatorProps) {
  const [draft, setDraft] = useState<LinkCreatorDraft>(defaultLinkCreatorDraft);
  const [generatedLink, setGeneratedLink] = useState<GeneratedArtifactLink | null>(null);
  const [generatedSignature, setGeneratedSignature] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const draftSignature = useMemo(() => getDraftSignature(draft), [draft]);
  const isGeneratedLinkStale = Boolean(generatedLink) && draftSignature !== generatedSignature;
  const contentFieldLabel = getBodyFieldLabel(draft.kind);
  const GeneratedKindIcon = kindIcons[generatedLink?.artifact.kind ?? draft.kind];

  useEffect(() => {
    setCopyState("idle");
    setError(null);
  }, [draftSignature]);

  const updateDraft = <K extends keyof LinkCreatorDraft>(field: K, value: LinkCreatorDraft[K]) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleGenerate = async () => {
    try {
      const nextGeneratedLink = await createGeneratedArtifactLinkAsync(draft, getBaseUrl());
      setGeneratedLink(nextGeneratedLink);
      setGeneratedSignature(draftSignature);
      setError(null);
      setCopyState("idle");
    } catch (generationError) {
      setGeneratedLink(null);
      setGeneratedSignature("");
      setCopyState("idle");
      setError(generationError instanceof Error ? generationError.message : "The link could not be generated.");
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

  return (
    <section className="home-generator-panel panel panel-strong fade-up px-3 py-3 sm:px-6 sm:py-5" style={{ animationDelay: "120ms" }}>
      <div className="home-generator-grid">
        <div>
          <div className="home-generator-heading">
            <div>
              <p className="section-kicker">Try it now</p>
              <h3 className="font-display mt-2 text-[2rem] font-semibold leading-[0.96] tracking-[-0.05em] sm:text-[2.7rem]">
                Make a shareable artifact link from pasted content.
              </h3>
            </div>
            <p className="max-w-2xl text-sm leading-[1.55rem] text-[color:var(--text-muted)] sm:text-base sm:leading-7">
              Pick a format, paste the artifact, and generate a real `agent-render` URL in the browser. No backend, no upload step, no extra route.
            </p>
          </div>

          <div className="creator-kind-grid" role="group" aria-label="Artifact kind">
            {artifactKinds.map((kind) => {
              const Icon = kindIcons[kind];
              const isActive = draft.kind === kind;

              return (
                <button
                  key={kind}
                  type="button"
                  className={cn("creator-kind-card", isActive && "is-active")}
                  aria-pressed={isActive}
                  onClick={() => updateDraft("kind", kind)}
                >
                  <span className="creator-kind-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="creator-kind-label">{kind}</span>
                </button>
              );
            })}
          </div>

          <form
            className="creator-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              handleGenerate();
            }}
          >
            <label className="creator-field">
              <span className="metric-label">Title</span>
              <input
                name="title"
                value={draft.title}
                onChange={(event) => updateDraft("title", event.target.value)}
                placeholder="Quarterly update"
                className="creator-input"
              />
            </label>

            <label className="creator-field">
              <span className="metric-label">Filename</span>
              <input
                name="filename"
                value={draft.filename}
                onChange={(event) => updateDraft("filename", event.target.value)}
                placeholder="update.md"
                className="creator-input"
              />
            </label>

            {draft.kind === "code" ? (
              <label className="creator-field">
                <span className="metric-label">Language</span>
                <input
                  name="language"
                  value={draft.language}
                  onChange={(event) => updateDraft("language", event.target.value)}
                  placeholder="tsx"
                  className="creator-input"
                />
              </label>
            ) : null}

            {draft.kind === "diff" ? (
              <label className="creator-field">
                <span className="metric-label">Diff view</span>
                <select
                  name="diffView"
                  value={draft.diffView}
                  onChange={(event) => updateDraft("diffView", event.target.value as LinkCreatorDraft["diffView"])}
                  className="creator-input"
                >
                  <option value="unified">Unified</option>
                  <option value="split">Split</option>
                </select>
              </label>
            ) : null}

            <label className="creator-field creator-field-full">
              <span className="creator-field-head">
                <span className="metric-label">{contentFieldLabel}</span>
                <span className="creator-field-hint">{fieldHints[draft.kind]}</span>
              </span>
              <textarea
                name="content"
                value={draft.content}
                onChange={(event) => updateDraft("content", event.target.value)}
                placeholder={fieldPlaceholders[draft.kind]}
                className="creator-textarea"
                rows={12}
              />
            </label>

            <div className="creator-form-footer">
              <button type="submit" className="artifact-action is-primary">
                <Link2 className="h-3.5 w-3.5" />
                Generate link
              </button>
              <div className="creator-codec-row" role="group" aria-label="Compression algorithm">
                <span className="metric-label">Compression</span>
                {(["auto", ...codecs] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={cn("artifact-action", (draft.codec ?? "auto") === option && "is-primary")}
                    aria-pressed={(draft.codec ?? "auto") === option}
                    onClick={() => updateDraft("codec", option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>

        <aside className="creator-result-shell">
          <div className="creator-result-card">
            <div className="creator-result-head">
              <div>
                <p className="section-kicker">Generated link</p>
                <h4 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Ready to copy, preview, or open</h4>
              </div>
              <span className="mono-pill">
                <GeneratedKindIcon className="h-3.5 w-3.5" />
                {generatedLink?.artifact.kind ?? draft.kind}
              </span>
            </div>

            {generatedLink ? (
              <>
                <div className="creator-link-frame">
                  <p className="metric-label">URL</p>
                  <textarea
                    className="creator-link-output"
                    value={generatedLink.url}
                    readOnly
                    aria-label="Generated agent-render link"
                    rows={5}
                  />
                </div>

                <div className="creator-result-metrics">
                  <div className="metric-card">
                    <p className="metric-label">Codec</p>
                    <p className="metric-value">{generatedLink.envelope.codec}</p>
                  </div>
                  <div className="metric-card">
                    <p className="metric-label">Fragment size</p>
                    <p className="metric-value">{generatedLink.fragmentLength.toLocaleString()} chars</p>
                  </div>
                </div>

                <div className="creator-result-actions">
                  <button type="button" className={cn("artifact-action", copyState === "copied" && "is-primary")} onClick={handleCopy}>
                    {copyState === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy link"}
                  </button>
                  <button type="button" className="artifact-action" onClick={() => onPreviewHash(generatedLink.hash)}>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    Preview here
                  </button>
                  <a href={generatedLink.url} target="_blank" rel="noreferrer" className="artifact-action">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in new tab
                  </a>
                </div>

                <div className="creator-result-note">
                  <p className="metric-label">Bundle title</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">{generatedLink.envelope.title}</p>
                  {isGeneratedLinkStale ? (
                    <p className="creator-inline-status" role="status">
                      The draft changed after the last generation. Generate again to refresh the link.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="creator-empty-state">
                <p className="text-sm leading-6 text-[color:var(--text-muted)]">
                  Generate a link to get a shareable URL that opens this artifact directly in the viewer.
                </p>
              </div>
            )}

            {error ? (
              <div className="creator-error-state" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
