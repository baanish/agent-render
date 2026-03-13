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

/** Public API for `parseGitPatchBundle`. */
export function parseGitPatchBundle(patch: string): ParsedPatchFile[] {
  return splitPatchSections(patch).map((section, index) => parsePatchSection(section, index));
}
