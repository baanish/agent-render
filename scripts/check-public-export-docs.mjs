import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOTS = ["src/lib", "src/components"];
const VALID_EXTENSIONS = new Set([".ts", ".tsx"]);
const EXPORT_FUNCTION_RE = /^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    if (!VALID_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    if (/\.(test|spec)\.[mc]?[tj]sx?$/.test(entry.name)) {
      continue;
    }

    yield fullPath;
  }
}

function hasPrecedingJsDoc(lines, index) {
  let lineIndex = index - 1;

  while (lineIndex >= 0 && lines[lineIndex].trim() === "") {
    lineIndex -= 1;
  }

  if (lineIndex < 0 || !lines[lineIndex].trim().endsWith("*/")) {
    return false;
  }

  for (let cursor = lineIndex; cursor >= 0; cursor -= 1) {
    const value = lines[cursor].trim();
    if (value.startsWith("/**")) {
      return true;
    }

    if (!value.startsWith("*") && !value.startsWith("/*") && !value.startsWith("//")) {
      return false;
    }
  }

  return false;
}

function findMissingDocs(filePath, source) {
  const lines = source.split(/\r?\n/);
  const missing = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(EXPORT_FUNCTION_RE);
    if (!match) {
      continue;
    }

    if (!hasPrecedingJsDoc(lines, index)) {
      missing.push({
        filePath,
        line: index + 1,
        name: match[1],
      });
    }
  }

  return missing;
}

const missingDocs = [];

for (const root of ROOTS) {
  for await (const filePath of walk(root)) {
    const source = await readFile(filePath, "utf8");
    missingDocs.push(...findMissingDocs(filePath, source));
  }
}

if (missingDocs.length > 0) {
  console.error("Missing JSDoc on public exported functions/components:\n");
  for (const item of missingDocs) {
    console.error(`- ${item.filePath}:${item.line} (${item.name})`);
  }
  console.error("\nAdd a preceding /** ... */ block for each public export listed above.");
  process.exit(1);
}

console.log("Public export documentation check passed.");
