"use client";

import { useEffect, useMemo, useState } from "react";
import { Columns2, Rows3 } from "lucide-react";
import { DiffFile, DiffModeEnum, DiffView } from "@git-diff-view/react";
import { useTheme } from "next-themes";
import { detectCodeLanguage } from "@/lib/code/language";
import { parseGitPatchBundle } from "@/lib/diff/git-patch";
import type { DiffArtifact } from "@/lib/payload/schema";

type DiffRendererProps = {
  artifact: DiffArtifact;
};

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

  const diffFiles = useMemo(() => {
    const patchFiles = artifact.patch
      ? parseGitPatchBundle(artifact.patch)
      : [
          {
            id: artifact.id,
            patch: artifact.patch ?? "",
            oldPath: artifact.filename ?? null,
            newPath: artifact.filename ?? null,
            displayPath: artifact.filename ?? artifact.id,
            status: "modified" as const,
            isBinary: false,
          },
        ];

    if (!artifact.patch && artifact.oldContent !== undefined && artifact.newContent !== undefined) {
      const fileName = artifact.filename ?? artifact.id;
      const language = detectCodeLanguage(fileName, artifact.language);
      const diffFile = new DiffFile(`a/${fileName}`, artifact.oldContent, `b/${fileName}`, artifact.newContent, [], language, language);
      diffFile.initTheme(resolvedTheme === "dark" ? "dark" : "light");
      diffFile.init();
      diffFile.buildSplitDiffLines();
      diffFile.buildUnifiedDiffLines();
      return [{ meta: patchFiles[0], diffFile }];
    }

    return patchFiles.map((patchFile) => {
      const language = detectCodeLanguage(patchFile.newPath ?? patchFile.oldPath ?? undefined, artifact.language);
      const diffFile = new DiffFile(
        patchFile.oldPath ? `a/${patchFile.oldPath}` : "/dev/null",
        "",
        patchFile.newPath ? `b/${patchFile.newPath}` : "/dev/null",
        "",
        [patchFile.patch],
        language,
        language,
      );
      diffFile.initTheme(resolvedTheme === "dark" ? "dark" : "light");
      diffFile.init();
      diffFile.buildSplitDiffLines();
      diffFile.buildUnifiedDiffLines();
      return { meta: patchFile, diffFile };
    });
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
          <div className="patch-bundle-shell">
            <nav className="patch-bundle-nav">
              {diffFiles.map(({ meta }) => (
                <a key={meta.id} href={`#patch-file-${meta.id}`} className="patch-bundle-link">
                  <span className="mono-pill">{meta.status}</span>
                  <span className="truncate">{meta.displayPath}</span>
                </a>
              ))}
            </nav>
            <div className="patch-bundle-files">
              {diffFiles.map(({ meta, diffFile }) => (
                <section key={meta.id} id={`patch-file-${meta.id}`} className="patch-file-section">
                  <header className="patch-file-header">
                    <div>
                      <p className="section-kicker">{meta.status}</p>
                      <h4>{meta.displayPath}</h4>
                    </div>
                    {meta.oldPath && meta.newPath && meta.oldPath !== meta.newPath ? (
                      <span className="mono-pill">{meta.oldPath} -&gt; {meta.newPath}</span>
                    ) : null}
                  </header>
                  {meta.isBinary ? (
                    <div className="artifact-empty-state">Binary patch preview is not expanded. Download the patch to inspect the raw binary diff headers.</div>
                  ) : (
                    <DiffView
                      diffFile={diffFile}
                      diffViewMode={mode}
                      diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
                      diffViewHighlight
                      diffViewWrap
                    />
                  )}
                </section>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
