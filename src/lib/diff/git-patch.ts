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

function stripDiffPrefix(filePath: string | null): string | null {
  if (!filePath || filePath === "/dev/null") {
    return null;
  }

  return filePath.replace(/^[ab]\//, "");
}

function splitPatchSections(patch: string): string[] {
  const normalized = patch.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const matches = [...normalized.matchAll(/^diff --git .*$/gm)];
  if (matches.length === 0) {
    return [normalized];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? normalized.length;
    return normalized.slice(start, end).trim();
  });
}

function parsePatchSection(section: string, index: number): ParsedPatchFile {
  const lines = section.split("\n");
  let oldPath: string | null = null;
  let newPath: string | null = null;
  let renameFrom: string | null = null;
  let renameTo: string | null = null;
  let status: PatchFileStatus = "modified";
  let isBinary = false;

  const headerMatch = /^diff --git a\/(.+) b\/(.+)$/.exec(lines[0] ?? "");
  if (headerMatch) {
    oldPath = headerMatch[1] ?? null;
    newPath = headerMatch[2] ?? null;
  }

  for (const line of lines) {
    if (line.startsWith("new file mode ")) {
      status = "added";
      continue;
    }

    if (line.startsWith("deleted file mode ")) {
      status = "deleted";
      continue;
    }

    if (line.startsWith("rename from ")) {
      renameFrom = line.slice("rename from ".length).trim();
      status = "renamed";
      continue;
    }

    if (line.startsWith("rename to ")) {
      renameTo = line.slice("rename to ".length).trim();
      status = "renamed";
      continue;
    }

    if (line.startsWith("copy from ")) {
      oldPath = line.slice("copy from ".length).trim();
      status = "copied";
      continue;
    }

    if (line.startsWith("copy to ")) {
      newPath = line.slice("copy to ".length).trim();
      status = "copied";
      continue;
    }

    if (line.startsWith("--- ")) {
      oldPath = stripDiffPrefix(line.slice(4).trim()) ?? oldPath;
      continue;
    }

    if (line.startsWith("+++ ")) {
      newPath = stripDiffPrefix(line.slice(4).trim()) ?? newPath;
      continue;
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
  }

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
 * Failure/fallback: empty or whitespace-only input returns an empty array.
 */
export function parseGitPatchBundle(patch: string): ParsedPatchFile[] {
  return splitPatchSections(patch).map((section, index) => parsePatchSection(section, index));
}
