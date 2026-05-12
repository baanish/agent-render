export type PatchFileStatus = "added" | "deleted" | "modified" | "renamed" | "copied" | "binary";

export type ParsedPatchFile = {
  id: string;
  patch: string;
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: PatchFileStatus;
  isBinary: boolean;
};

const UNIFIED_HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(?: .*)?$/;
const DIFF_SECTION_HEADER_RE = /^diff --git .*$/gm;

function stripDiffPrefix(filePath: string | null): string | null {
  if (!filePath || filePath === "/dev/null") {
    return null;
  }

  return filePath.replace(/^[ab]\//, "");
}

function normalizePatch(patch: string): string {
  return patch.replace(/\r\n/g, "\n").trim();
}

function getFirstLine(value: string): string {
  const newlineIndex = value.indexOf("\n");
  return newlineIndex === -1 ? value : value.slice(0, newlineIndex);
}

function scanLines(value: string, visitLine: (line: string) => void): void {
  let lineStart = 0;

  while (lineStart <= value.length) {
    const lineEnd = value.indexOf("\n", lineStart);
    if (lineEnd === -1) {
      visitLine(value.slice(lineStart));
      return;
    }

    visitLine(value.slice(lineStart, lineEnd));
    lineStart = lineEnd + 1;
  }
}

function parsePatchSections(patch: string): ParsedPatchFile[] {
  const normalized = normalizePatch(patch);
  if (!normalized) {
    return [];
  }

  DIFF_SECTION_HEADER_RE.lastIndex = 0;

  const files: ParsedPatchFile[] = [];
  let previousStart = -1;
  let sectionIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DIFF_SECTION_HEADER_RE.exec(normalized)) !== null) {
    if (previousStart !== -1) {
      files.push(parsePatchSection(normalized.slice(previousStart, match.index).trim(), sectionIndex));
      sectionIndex += 1;
    }
    previousStart = match.index;
  }

  if (previousStart === -1) {
    return [parsePatchSection(normalized, 0)];
  }

  files.push(parsePatchSection(normalized.slice(previousStart).trim(), sectionIndex));
  return files;
}

function parsePatchSection(section: string, index: number): ParsedPatchFile {
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let renameFrom: string | null = null;
  let renameTo: string | null = null;
  let status: PatchFileStatus = "modified";
  let isBinary = false;

  const headerMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(getFirstLine(section));
  if (headerMatch) {
    oldPath = headerMatch[1] ?? null;
    newPath = headerMatch[2] ?? null;
  }

  scanLines(section, (line) => {
    if (line.startsWith("new file mode ")) {
      status = "added";
      return;
    }

    if (line.startsWith("deleted file mode ")) {
      status = "deleted";
      return;
    }

    if (line.startsWith("rename from ")) {
      renameFrom = line.slice("rename from ".length).trim();
      status = "renamed";
      return;
    }

    if (line.startsWith("rename to ")) {
      renameTo = line.slice("rename to ".length).trim();
      status = "renamed";
      return;
    }

    if (line.startsWith("copy from ")) {
      oldPath = line.slice("copy from ".length).trim();
      status = "copied";
      return;
    }

    if (line.startsWith("copy to ")) {
      newPath = line.slice("copy to ".length).trim();
      status = "copied";
      return;
    }

    if (line.startsWith("--- ")) {
      oldPath = stripDiffPrefix(line.slice(4).trim()) ?? oldPath;
      return;
    }

    if (line.startsWith("+++ ")) {
      newPath = stripDiffPrefix(line.slice(4).trim()) ?? newPath;
      return;
    }

    if (line.startsWith("@@") && !UNIFIED_HUNK_HEADER_RE.test(line)) {
      throw new Error(`Invalid hunk header: ${line}`);
    }

    if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      if (line.startsWith("Binary files ")) {
        const binaryMatch = /^Binary files (.+) and (.+) differ$/.exec(line);
        if (binaryMatch) {
          oldPath = stripDiffPrefix(binaryMatch[1]?.trim() ?? null);
          newPath = stripDiffPrefix(binaryMatch[2]?.trim() ?? null);
        }
      }
      isBinary = true;
      status = "binary";
    }
  });

  oldPath = stripDiffPrefix(renameFrom ?? oldPath);
  newPath = stripDiffPrefix(renameTo ?? newPath);

  const displayPath = newPath ?? oldPath ?? `file-${index + 1}`;

  return {
    id: `${displayPath}-${index}`,
    patch: `${section.trimEnd()}\n`,
    oldPath,
    newPath,
    displayPath,
    status,
    isBinary,
  };
}

/**
 * Parses a git patch bundle into per-file patch entries.
 *
 * Expects a unified git patch string and splits multi-file input on each `diff --git` header;
 * if no such headers are present, the full input is treated as a single section.
 * Detects rename/copy metadata and binary markers (`Binary files ... differ` / `GIT binary patch`),
 * normalizes paths by removing `a/` and `b/` prefixes, and sets `status`/`isBinary` accordingly.
 * Output IDs are deterministic `${displayPath}-${index}` values so multiple sections with the same
 * path remain distinct.
 *
 * @param patch - Unified git patch text that may include one or many file sections.
 * @returns Parsed file-level patch records ready for diff rendering.
 *
 * Failure/fallback: empty or whitespace-only input returns an empty array; malformed hunk
 * headers throw so callers can stay on the lightweight raw fallback path.
 */
export function parseGitPatchBundle(patch: string): ParsedPatchFile[] {
  return parsePatchSections(patch);
}
