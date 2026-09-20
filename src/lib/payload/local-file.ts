import { detectCodeLanguage } from "@/lib/code/language";
import type { LinkCreatorDraft } from "@/lib/payload/link-creator";
import {
  MAX_DECODED_PAYLOAD_LENGTH,
  type ArtifactKind,
} from "@/lib/payload/schema";

/** Generous byte cap so a UTF-8 file can still fit the decoded character budget. */
export const MAX_LOCAL_FILE_BYTES = MAX_DECODED_PAYLOAD_LENGTH * 4;

/**
 * `accept` list for the homepage file picker. Browsers still allow “all files”;
 * {@link createDraftFromLocalFile} rejects binaries after selection.
 */
export const LOCAL_ARTIFACT_FILE_ACCEPT = [
  "text/*",
  ".md",
  ".markdown",
  ".mdx",
  ".json",
  ".csv",
  ".tsv",
  ".diff",
  ".patch",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".hpp",
  ".html",
  ".htm",
  ".css",
  ".yml",
  ".yaml",
  ".sh",
  ".bash",
  ".sql",
  ".xml",
  ".toml",
  ".txt",
].join(",");

const BINARY_EXTENSIONS = new Set([
  "7z",
  "avif",
  "bin",
  "bmp",
  "dat",
  "dll",
  "doc",
  "docx",
  "dylib",
  "eot",
  "exe",
  "gif",
  "gz",
  "ico",
  "jpeg",
  "jpg",
  "mp3",
  "mp4",
  "ogg",
  "otf",
  "pdf",
  "png",
  "ppt",
  "pptx",
  "rar",
  "so",
  "tgz",
  "ttf",
  "wasm",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2",
  "xls",
  "xlsx",
  "zip",
]);

const BINARY_MIME_TYPES = new Set([
  "application/gzip",
  "application/octet-stream",
  "application/pdf",
  "application/x-gzip",
  "application/zip",
]);

const CODE_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cjs",
  "cpp",
  "css",
  "cts",
  "go",
  "h",
  "hpp",
  "htm",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "lua",
  "mjs",
  "mts",
  "php",
  "py",
  "rb",
  "rs",
  "scala",
  "sh",
  "sql",
  "swift",
  "toml",
  "ts",
  "tsx",
  "xml",
  "yaml",
  "yml",
]);

export type LocalArtifactFile = {
  name: string;
  size: number;
  type?: string;
  text: string;
};

function getFilenameExtension(filename: string) {
  const basename = filename.split(/[/\\]/).pop() ?? filename;
  const separator = basename.lastIndexOf(".");
  if (separator <= 0 || separator === basename.length - 1) {
    return "";
  }

  return basename.slice(separator + 1).toLowerCase();
}

function getBasename(filename: string) {
  const basename = filename.split(/[/\\]/).pop()?.trim();
  return basename && basename.length > 0 ? basename : "artifact";
}

function getTitleFromFilename(filename: string) {
  const basename = getBasename(filename);
  const stem = basename.replace(/\.[^./\\]+$/, "").trim();
  return stem || basename;
}

/**
 * Maps a local filename extension onto a supported artifact kind.
 *
 * Known document/data extensions win first. Common source extensions become
 * `code`. Unknown extensions return `null` so the current draft kind is kept.
 */
export function inferArtifactKindFromFilename(filename: string): ArtifactKind | null {
  const extension = getFilenameExtension(filename);

  switch (extension) {
    case "md":
    case "markdown":
    case "mdx":
      return "markdown";
    case "json":
      return "json";
    case "csv":
    case "tsv":
      return "csv";
    case "diff":
    case "patch":
      return "diff";
    default:
      return CODE_EXTENSIONS.has(extension) ? "code" : null;
  }
}

function isBinaryMimeType(type: string | undefined) {
  const normalized = type?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith("image/") ||
    normalized.startsWith("audio/") ||
    normalized.startsWith("video/") ||
    BINARY_MIME_TYPES.has(normalized)
  );
}

function isKnownTextFilename(filename: string) {
  return getFilenameExtension(filename) === "txt" || inferArtifactKindFromFilename(filename) !== null;
}

/**
 * True when decoded text contains NUL, replacement characters, or C0 controls
 * other than tab / newline / carriage return.
 */
function looksLikeBinaryText(content: string) {
  if (content.includes("\0") || content.includes("\uFFFD")) {
    return true;
  }

  for (const char of content) {
    const code = char.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      return true;
    }
  }

  return false;
}

/**
 * Rejects files that should not be read into the link-creator draft.
 *
 * Throws when the file is empty, larger than {@link MAX_LOCAL_FILE_BYTES}, has a
 * binary extension, or reports a binary MIME type on an unknown extension.
 * Known text/source extensions skip the MIME check. Callers still need to
 * validate the decoded text with {@link createDraftFromLocalFile}.
 */
export function assertReadableLocalArtifactFile(file: {
  name: string;
  size: number;
  type?: string;
}) {
  if (file.size <= 0) {
    throw new Error("The selected file is empty.");
  }

  if (file.size > MAX_LOCAL_FILE_BYTES) {
    throw new Error(
      `This file is over the ${MAX_LOCAL_FILE_BYTES.toLocaleString()} byte local-file limit.`,
    );
  }

  const extension = getFilenameExtension(file.name);
  if (BINARY_EXTENSIONS.has(extension)) {
    throw new Error("This file looks binary. Choose a text file.");
  }

  // Known text/source extensions win over a misleading MIME type. Browsers and
  // OS pickers often report `.ts` / `.mts` as `video/mp2t`.
  if (!isKnownTextFilename(file.name) && isBinaryMimeType(file.type)) {
    throw new Error("This file looks binary. Choose a text file.");
  }
}

/**
 * Builds a link-creator draft from a locally read text file.
 *
 * Filename, title, and kind update from the file when the extension is known.
 * Codec and diff-view preferences are preserved. Throws when the file is empty,
 * oversized, binary, or over {@link MAX_DECODED_PAYLOAD_LENGTH} characters.
 */
export function createDraftFromLocalFile(
  file: LocalArtifactFile,
  current: LinkCreatorDraft,
): LinkCreatorDraft {
  assertReadableLocalArtifactFile(file);

  const content = file.text.replace(/^\uFEFF/, "");
  if (!/\S/.test(content)) {
    throw new Error("The selected file is empty.");
  }

  if (looksLikeBinaryText(content)) {
    throw new Error("This file looks binary. Choose a text file.");
  }

  if (content.length > MAX_DECODED_PAYLOAD_LENGTH) {
    throw new Error(
      `This file is over the ${MAX_DECODED_PAYLOAD_LENGTH.toLocaleString()} character decoded payload limit.`,
    );
  }

  const filename = getBasename(file.name);
  const kind = inferArtifactKindFromFilename(filename) ?? current.kind;
  const detectedLanguage = detectCodeLanguage(filename);
  const language =
    kind === "code" ? (detectedLanguage === "text" ? "" : detectedLanguage) : current.language;

  return {
    ...current,
    kind,
    title: getTitleFromFilename(filename),
    filename,
    content,
    language,
  };
}
