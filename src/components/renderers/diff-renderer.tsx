"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns2, Rows3 } from "lucide-react";
import { DiffModeEnum, DiffView } from "@git-diff-view/react";
import { generateDiffFile } from "@git-diff-view/file";
import { useTheme } from "next-themes";
import type { DiffArtifact } from "@/lib/payload/schema";

type DiffRendererProps = {
  artifact: DiffArtifact;
};

function detectLanguage(filename?: string, fallback?: string) {
  const explicit = fallback?.trim().toLowerCase();
  if (explicit) return explicit;

  const lower = filename?.toLowerCase() ?? "";
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".jsx") || lower.endsWith(".js")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";
  return "text";
}

function materializePatch(artifact: DiffArtifact) {
  if (artifact.oldContent !== undefined || artifact.newContent !== undefined) {
    return {
      oldFileName: `a/${artifact.filename ?? "before.txt"}`,
      newFileName: `b/${artifact.filename ?? "after.txt"}`,
      oldContent: artifact.oldContent ?? "",
      newContent: artifact.newContent ?? "",
    };
  }

  const patch = artifact.patch ?? "";
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  let oldFileName = "a/before.txt";
  let newFileName = artifact.filename ? `b/${artifact.filename}` : "b/after.txt";
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      oldFileName = line.slice(4).trim() || oldFileName;
      continue;
    }
    if (line.startsWith("+++ ")) {
      newFileName = line.slice(4).trim() || newFileName;
      continue;
    }
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk || !line || line.startsWith("diff --git") || line.startsWith("index ")) {
      continue;
    }
    if (line === "\\ No newline at end of file") {
      continue;
    }

    const marker = line[0];
    const value = line.slice(1);
    if (marker === " ") {
      oldLines.push(value);
      newLines.push(value);
    } else if (marker === "-") {
      oldLines.push(value);
    } else if (marker === "+") {
      newLines.push(value);
    }
  }

  return {
    oldFileName,
    newFileName,
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n"),
  };
}

export function DiffRenderer({ artifact }: DiffRendererProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const mobileDefault = typeof window !== "undefined" ? window.innerWidth < 960 : false;
  const [mode, setMode] = useState<DiffModeEnum>(
    artifact.view === "split" && !mobileDefault ? DiffModeEnum.Split : DiffModeEnum.Unified,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const diffFile = useMemo(() => {
    const { oldFileName, newFileName, oldContent, newContent } = materializePatch(artifact);
    const language = detectLanguage(newFileName, artifact.language);
    const file = generateDiffFile(oldFileName, oldContent, newFileName, newContent, language, language);
    file.initTheme(resolvedTheme === "dark" ? "dark" : "light");
    file.init();
    file.buildSplitDiffLines();
    file.buildUnifiedDiffLines();
    return file;
  }, [artifact, resolvedTheme]);

  return (
    <div className="diff-renderer-shell">
      <div className="diff-renderer-toolbar">
        <div className="code-renderer-meta">
          <span className="mono-pill">review-style diff</span>
          <span className="section-kicker">syntax highlighted</span>
        </div>
        <div className="diff-view-toggle">
          <button
            type="button"
            className={`artifact-action ${mode === DiffModeEnum.Unified ? "is-primary" : ""}`}
            onClick={() => setMode(DiffModeEnum.Unified)}
          >
            <Rows3 className="h-3.5 w-3.5" />
            Unified
          </button>
          <button
            type="button"
            className={`artifact-action ${mode === DiffModeEnum.Split ? "is-primary" : ""}`}
            onClick={() => setMode(DiffModeEnum.Split)}
          >
            <Columns2 className="h-3.5 w-3.5" />
            Split
          </button>
        </div>
      </div>
      <div className="diff-renderer-frame">
        {mounted ? (
          <DiffView
            diffFile={diffFile}
            diffViewMode={mode}
            diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
            diffViewHighlight
            diffViewWrap
          />
        ) : null}
      </div>
    </div>
  );
}
