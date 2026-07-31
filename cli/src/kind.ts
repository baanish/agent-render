import path from "node:path";
import type { ArtifactKind } from "../../src/lib/payload/schema";

export type RequestedKind = ArtifactKind | "auto";

export type DetectedKind = {
  kind: ArtifactKind;
  language?: string;
};

const kindByExtension = new Map<string, ArtifactKind>([
  [".md", "markdown"],
  [".markdown", "markdown"],
  [".diff", "diff"],
  [".patch", "diff"],
  [".csv", "csv"],
  [".json", "json"],
]);

const languageByExtension = new Map<string, string>([
  [".c", "c"],
  [".cc", "cpp"],
  [".cpp", "cpp"],
  [".css", "css"],
  [".go", "go"],
  [".html", "html"],
  [".java", "java"],
  [".js", "javascript"],
  [".jsx", "jsx"],
  [".py", "python"],
  [".rb", "ruby"],
  [".rs", "rust"],
  [".sh", "shell"],
  [".sql", "sql"],
  [".ts", "typescript"],
  [".tsx", "tsx"],
  [".xml", "xml"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
]);

/** Detects an artifact kind and optional code language from a filename. */
export function detectArtifactKind(filename: string, requested: RequestedKind = "auto"): DetectedKind {
  const extension = path.extname(filename).toLowerCase();

  if (requested !== "auto") {
    return requested === "code"
      ? { kind: requested, language: languageByExtension.get(extension) ?? (extension.slice(1) || undefined) }
      : { kind: requested };
  }

  const kind = kindByExtension.get(extension);
  if (kind) {
    return { kind };
  }

  return {
    kind: "code",
    language: languageByExtension.get(extension) ?? (extension.slice(1) || undefined),
  };
}
