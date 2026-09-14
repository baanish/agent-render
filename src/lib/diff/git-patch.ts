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
const HUNK_COUNTS_RE = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;
const DIFF_SECTION_HEADER_RE = /^diff --git .*$/gm;
const TRADITIONAL_FILE_HEADER_RE = /^--- \S[^\n]*\n\+\+\+ \S[^\n]*(?:\n|$)/m;

function readGitPathToken(value: string, start: number): { token: string; end: number } | null {
  if (start >= value.length) {
    return null;
  }
  if (value[start] !== '"') {
    const end = value.indexOf(" ", start);
    return {
      token: value.slice(start, end === -1 ? value.length : end),
      end: end === -1 ? value.length : end,
    };
  }
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
    } else if (value[index] === '"') {
      return { token: value.slice(start, index + 1), end: index + 1 };
    }
  }
  return null;
}

function unquoteGitPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  const quoted = trimmed.slice(1, -1);
  let decoded = "";
  for (let index = 0; index < quoted.length; index += 1) {
    const character = quoted[index] ?? "";
    if (character !== "\\" || index + 1 >= quoted.length) {
      decoded += character;
      continue;
    }
    const escaped = quoted[index + 1] ?? "";
    index += 1;
    if (escaped === "t") {
      decoded += "\t";
    } else if (escaped === "n") {
      decoded += "\n";
    } else if (escaped === "r") {
      decoded += "\r";
    } else if (escaped === "\\" || escaped === '"') {
      decoded += escaped;
    } else {
      decoded += `\\${escaped}`;
    }
  }
  return decoded;
}

function normalizeRepositoryPath(filePath: string): string | null {
  const normalized = unquoteGitPath(filePath);
  return normalized && !normalized.endsWith("/") ? normalized : null;
}

function stripDiffPrefix(filePath: string | null): string | null {
  if (!filePath) {
    return null;
  }

  const normalized = unquoteGitPath(filePath);
  if (normalized === "/dev/null") {
    return null;
  }

  const stripped = normalized.replace(/^[ab]\//, "");
  // A path that reduces to empty (e.g. a bare "a/") is not a usable path; return null so the
  // `displayPath`/`id` fallback chain (newPath ?? oldPath ?? `file-N`) applies instead of
  // producing an empty label and a degenerate "-N" id.
  return stripped === "" ? null : stripped;
}

function parseDiffGitPaths(line: string): [string | null, string | null] | null {
  const prefix = "diff --git ";
  if (!line.startsWith(prefix)) {
    return null;
  }
  const oldToken = readGitPathToken(line, prefix.length);
  if (!oldToken || line[oldToken.end] !== " ") {
    return null;
  }
  const newToken = readGitPathToken(line, oldToken.end + 1);
  if (!newToken || newToken.end !== line.length) {
    return null;
  }
  return [stripDiffPrefix(oldToken.token), stripDiffPrefix(newToken.token)];
}

function parseMarkerPath(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    const quoted = readGitPathToken(trimmed, 0);
    return stripDiffPrefix(quoted?.token ?? trimmed);
  }
  return stripDiffPrefix(trimmed.split("\t", 1)[0] ?? null);
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

type HunkCursor = { old: number; new: number };

function isInsideHunk(cursor: HunkCursor): boolean {
  return cursor.old > 0 || cursor.new > 0;
}

function consumeHunkLine(line: string, cursor: HunkCursor): boolean {
  const hunkCounts = HUNK_COUNTS_RE.exec(line);
  if (hunkCounts) {
    cursor.old = hunkCounts[1] === undefined ? 1 : Number(hunkCounts[1]);
    cursor.new = hunkCounts[2] === undefined ? 1 : Number(hunkCounts[2]);
    return true;
  }
  if (!isInsideHunk(cursor)) {
    return false;
  }
  if (line !== "\\ No newline at end of file") {
    if (line.startsWith("+")) {
      cursor.new = Math.max(0, cursor.new - 1);
    } else if (line.startsWith("-")) {
      cursor.old = Math.max(0, cursor.old - 1);
    } else {
      cursor.old = Math.max(0, cursor.old - 1);
      cursor.new = Math.max(0, cursor.new - 1);
    }
  }
  return true;
}

function findTraditionalSectionStarts(value: string): number[] {
  const lines = value.split("\n");
  const starts: number[] = [];
  const hunkCursor: HunkCursor = { old: 0, new: 0 };
  let offset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (
      !isInsideHunk(hunkCursor) &&
      line.startsWith("--- ") &&
      lines[index + 1]?.startsWith("+++ ")
    ) {
      starts.push(offset);
    }
    consumeHunkLine(line, hunkCursor);
    offset += line.length + (index < lines.length - 1 ? 1 : 0);
  }
  return starts;
}

function parseNonGitSections(value: string, startIndex: number): ParsedPatchFile[] {
  const sections: ParsedPatchFile[] = [];
  const starts = findTraditionalSectionStarts(value);
  if (starts.length === 0) {
    const section = value.trim();
    return section ? [parsePatchSection(section, startIndex)] : [];
  }
  if (starts[0] && starts[0] > 0) {
    const preamble = value.slice(0, starts[0]).trim();
    if (preamble) {
      sections.push(parsePatchSection(preamble, startIndex));
    }
  }
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] ?? 0;
    const end = starts[index + 1] ?? value.length;
    sections.push(parsePatchSection(value.slice(start, end).trim(), startIndex + sections.length));
  }
  return sections;
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
    } else if (match.index > 0) {
      const leadingSections = parseNonGitSections(normalized.slice(0, match.index), sectionIndex);
      files.push(...leadingSections);
      sectionIndex += leadingSections.length;
    }
    previousStart = match.index;
  }

  if (previousStart === -1) {
    return parseNonGitSections(normalized, 0);
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
  const hunkCursor: HunkCursor = { old: 0, new: 0 };

  const firstLine = getFirstLine(section);
  const headerPaths = parseDiffGitPaths(firstLine);
  const hasTraditionalHeader = TRADITIONAL_FILE_HEADER_RE.test(section);
  if (headerPaths) {
    [oldPath, newPath] = headerPaths;
  }

  scanLines(section, (line) => {
    if (
      (headerPaths || hasTraditionalHeader) &&
      line.startsWith("@@") &&
      !UNIFIED_HUNK_HEADER_RE.test(line)
    ) {
      throw new Error(`Invalid hunk header: ${line}`);
    }
    if (consumeHunkLine(line, hunkCursor)) {
      return;
    }

    if (line.startsWith("new file mode ")) {
      status = "added";
      return;
    }

    if (line.startsWith("deleted file mode ")) {
      status = "deleted";
      return;
    }

    if (line.startsWith("rename from ")) {
      renameFrom = normalizeRepositoryPath(line.slice("rename from ".length));
      status = "renamed";
      return;
    }

    if (line.startsWith("rename to ")) {
      renameTo = normalizeRepositoryPath(line.slice("rename to ".length));
      status = "renamed";
      return;
    }

    if (line.startsWith("copy from ")) {
      oldPath = normalizeRepositoryPath(line.slice("copy from ".length));
      status = "copied";
      return;
    }

    if (line.startsWith("copy to ")) {
      newPath = normalizeRepositoryPath(line.slice("copy to ".length));
      status = "copied";
      return;
    }

    if (line.startsWith("--- ")) {
      oldPath = parseMarkerPath(line.slice(4)) ?? oldPath;
      return;
    }

    if (line.startsWith("+++ ")) {
      newPath = parseMarkerPath(line.slice(4)) ?? newPath;
      return;
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

  oldPath = renameFrom ?? oldPath;
  newPath = renameTo ?? newPath;

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
 * Expects a unified patch string and splits multi-file input on `diff --git` headers or
 * adjacent traditional `---`/`+++` file headers.
 * Detects rename/copy metadata and binary markers (`Binary files ... differ` / `GIT binary patch`),
 * normalizes paths by removing `a/` and `b/` prefixes, and sets `status`/`isBinary` accordingly.
 * Output IDs are deterministic `${displayPath}-${index}` values so multiple sections with the same
 * path remain distinct.
 *
 * @param patch - Unified git patch text that may include one or many file sections.
 * @returns Parsed file-level patch records ready for diff rendering.
 *
 * Failure/fallback: empty or whitespace-only input returns an empty array; malformed hunk
 * headers inside diff sections throw so callers can stay on the lightweight raw fallback path.
 */
export function parseGitPatchBundle(patch: string): ParsedPatchFile[] {
  return parsePatchSections(patch);
}

const BINARY_PATCH_RE = /^(?:Binary files .+ and .+ differ|GIT binary patch)$/;

/**
 * Sections that render as files. The parser keeps leading format-patch email
 * preambles as their own section for fidelity, but only sections with a valid
 * git header, an adjacent traditional `---`/`+++` header pair, or a binary patch
 * marker may reach PatchDiff and the file tree. Filtering every bundle by the
 * same grammar keeps standalone review notes out without dropping traditional
 * diffs that appear before a git-style section.
 *
 * @param files - Sections from `parseGitPatchBundle`.
 * @returns The sections that contain renderable diff data.
 */
export function getRenderablePatchFiles(files: readonly ParsedPatchFile[]): ParsedPatchFile[] {
  return files.filter((file) => {
    const firstLine = getFirstLine(file.patch);
    return (
      parseDiffGitPaths(firstLine) !== null ||
      TRADITIONAL_FILE_HEADER_RE.test(file.patch) ||
      BINARY_PATCH_RE.test(firstLine)
    );
  });
}

/**
 * Unique display labels for parsed sections. Repeated `displayPath` values
 * (concatenated changes to the same path) gain a ` (n)` suffix so every
 * section stays reachable through tree navigation, which keys rows by path.
 *
 * @param files - Sections from `parseGitPatchBundle`.
 * @returns A map from section `id` to its unique label.
 */
export function getPatchFileLabels(files: readonly ParsedPatchFile[]): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Set<string>();
  for (const file of files) {
    const base = file.displayPath;
    let label = base;
    let suffix = 2;
    while (used.has(label)) {
      label = `${base} (${suffix})`;
      suffix += 1;
    }
    used.add(label);
    labels.set(file.id, label);
  }
  return labels;
}
