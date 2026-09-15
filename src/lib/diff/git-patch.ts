import {
  parsePatchFiles,
  type FileDiffMetadata,
} from "@pierre/diffs";
import { getUniqueLabels } from "@/lib/unique-labels";

export type PatchFileStatus =
  | "added"
  | "deleted"
  | "modified"
  | "renamed"
  | "binary";

/**
 * One renderable file section in a patch, adapted from Pierre's
 * `FileDiffMetadata` with the labels the shell UI needs.
 */
export type ParsedPatchFile = {
  id: string;
  meta: FileDiffMetadata | null;
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: PatchFileStatus;
  isBinary: boolean;
  /** One-based line where the file's section starts in the normalized patch. */
  startLine: number;
};

// Pierre's parser routes leading text (commit messages, preambles) into
// `patchMetadata`; a traditional `---`/`+++`/`@@` file diff stranded there is
// still a real file, so it gets reparsed recursively.
const TRADITIONAL_FILE_RE = /^--- \S[^\n]*\n\+\+\+ \S/m;

// Binary sections carry no hunks, so Pierre cannot distinguish them from a
// mode-only change; the marker lines are the only reliable signal.
const BINARY_MARKER_RE = /^(?:GIT binary patch|Binary files .+ and .+ differ)$/m;
const SECTION_START_RE = /^diff --git /;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function collectFileDiffs(patch: string, into: FileDiffMetadata[]): void {
  for (const parsed of parsePatchFiles(patch, undefined, true)) {
    const metadata = parsed.patchMetadata;
    if (metadata && TRADITIONAL_FILE_RE.test(metadata)) {
      collectFileDiffs(metadata, into);
    }
    into.push(...parsed.files);
  }
}

// Maps file index to the raw line range of its section, used for editor
// scroll targets and binary-marker detection. A `---`/`+++`/`@@` triple is a
// traditional file header, but only outside a hunk body: inside one, a removed
// `-- x` line reads `--- x` and an added `++ y` line reads `+++ y`, so the
// scanner tracks the declared hunk counts before trusting a triple.
function findSectionRanges(lines: string[]): { start: number; end: number }[] {
  const starts: number[] = [];
  // A git section's own `--- a/`/`+++ b/` pair is that file's header, consumed
  // once via gitHeaderSeen; any later triple is a standalone traditional file
  // following the git content.
  let insideGitSection = false;
  let gitHeaderSeen = false;
  let hunkOld = 0;
  let hunkNew = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (SECTION_START_RE.test(line)) {
      insideGitSection = true;
      gitHeaderSeen = false;
      hunkOld = 0;
      hunkNew = 0;
      starts.push(index);
      continue;
    }
    const hunk = HUNK_HEADER_RE.exec(line);
    if (hunk) {
      hunkOld = hunk[2] ? Number(hunk[2]) : 1;
      hunkNew = hunk[4] ? Number(hunk[4]) : 1;
      continue;
    }
    if (hunkOld > 0 || hunkNew > 0) {
      if (line.startsWith("-")) {
        hunkOld -= 1;
      } else if (line.startsWith("+")) {
        hunkNew -= 1;
      } else if (line.startsWith(" ") || line === "") {
        hunkOld -= 1;
        hunkNew -= 1;
      }
      continue;
    }
    const isTraditionalHeader =
      line.startsWith("--- ") &&
      (lines[index + 1] ?? "").startsWith("+++ ") &&
      HUNK_HEADER_RE.test(lines[index + 2] ?? "");
    if (!isTraditionalHeader) {
      continue;
    }
    if (insideGitSection && !gitHeaderSeen && /^--- (?:a\/|"a\/|\/dev\/null)/.test(line)) {
      gitHeaderSeen = true;
    } else {
      insideGitSection = false;
      starts.push(index);
    }
  }
  return starts.map((start, index) => ({
    start,
    end: starts[index + 1] ?? lines.length,
  }));
}

// Pierre strips the `a/`/`b/` prefix on `diff --git` paths but keeps it on
// traditional `---`/`+++` names, so only traditional names need the strip.
function normalizePatchPath(path: string | undefined, isTraditional: boolean): string | null {
  if (!path || path === "/dev/null") {
    return null;
  }
  return isTraditional ? path.replace(/^[ab]\//, "") : path;
}

function getPatchFileStatus(meta: FileDiffMetadata): PatchFileStatus {
  switch (meta.type) {
    case "new":
      return "added";
    case "deleted":
      return "deleted";
    case "rename-pure":
    case "rename-changed":
      return "renamed";
    default:
      return "modified";
  }
}

/**
 * Parses a unified patch into the file sections the viewer renders. Throws on
 * malformed hunk bodies so callers can fall back to the raw view.
 */
export function parseRenderablePatchFiles(patch: string): ParsedPatchFile[] {
  const normalized = patch.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const metas: FileDiffMetadata[] = [];
  collectFileDiffs(normalized, metas);
  const ranges = findSectionRanges(lines);

  const files = metas.map<ParsedPatchFile>((meta, index) => {
    const range = index < ranges.length ? ranges[index] : undefined;
    const isTraditional = range
      ? !SECTION_START_RE.test(lines[range.start] ?? "")
      : false;
    const oldPath = normalizePatchPath(meta.prevName, isTraditional);
    const newPath = normalizePatchPath(meta.name, isTraditional);
    const isBinary = range
      ? lines.slice(range.start, range.end).some((line) => BINARY_MARKER_RE.test(line))
      : false;

    return {
      id: `${newPath ?? oldPath ?? `file-${index + 1}`}-${index}`,
      meta,
      oldPath,
      newPath,
      displayPath: newPath ?? oldPath ?? `file-${index + 1}`,
      status: isBinary ? "binary" : getPatchFileStatus(meta),
      isBinary,
      startLine: range ? range.start + 1 : 1,
    };
  });

  if (files.length === 0 && BINARY_MARKER_RE.test(normalized)) {
    const markerLine = lines.findIndex((line) => BINARY_MARKER_RE.test(line));
    files.push({
      id: "binary-0",
      meta: null,
      oldPath: null,
      newPath: null,
      displayPath: "binary patch",
      status: "binary",
      isBinary: true,
      startLine: markerLine + 1,
    });
  }

  return files;
}

/**
 * Builds unique display labels for patch files; repeated paths get ` (n)`
 * suffixes so tree rows and section anchors stay distinct.
 */
export function getPatchFileLabels(
  files: readonly ParsedPatchFile[],
): Map<string, string> {
  return getUniqueLabels(
    files.map((file) => ({ id: file.id, base: file.displayPath })),
  );
}
