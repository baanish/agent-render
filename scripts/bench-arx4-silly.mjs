#!/usr/bin/env node
/**
 * ARX4 "silly cuts" probe — unconventional Discord packing ideas beyond
 * envelope/Brotli tweaks.
 *
 * Experimental only. Does not change the shipped codec surface.
 *
 * After bet #2 showed binary envelopes + real shared Brotli dict are ~0–2%,
 * this probe measures deeper / weirder levers that can still be quantified
 * without a Discord API:
 *
 *   A. Implied envelope (raw content + 1-byte kind) — skip JSON/tuple entirely
 *   B. Kind-specific IR (markdown strip, JSON key-dict, CSV columnar)
 *   C. Pre-shared chunk prior (CDC-ish fingerprints → short IDs)
 *   D. Template / skeleton delta (diff vs known scaffold)
 *   E. Lossy "readable enough" (whitespace collapse, fence strip)
 *   F. Label-as-bitstream (steal title bits from Discord link label)
 *   G. Mosaic multipart links (N × Discord budget math)
 *   H. Hybrid fence payload (short URL + ```arx fence in same message)
 *   I. BPE-ish word pack (corpus-trained token table → varint stream)
 *
 * Writes `docs/arx4-silly-cuts.md`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

const REPORT_PATH = "docs/arx4-silly-cuts.md";
const DISCORD_MESSAGE_MAX = 2000;
const BMP_BASE_SIZE = 62_000;
const FENCE_TAG = "arx";

const v1Dictionary = JSON.parse(readFileSync("public/arx-dictionary.json", "utf8"));
const overlayDictionary = JSON.parse(readFileSync("public/arx2-dictionary.json", "utf8"));
const codeBenchReportFixture = readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8");

const singleByteCodes = [
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15,
  0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
];

function buildPairs(dict, singleCodes = singleByteCodes, extendedPrefix = "\x00", extendedOffset = 1) {
  const pairs = [];
  for (let i = 0; i < dict.singleByteSlots.length && i < singleCodes.length; i++) {
    pairs.push([dict.singleByteSlots[i], String.fromCharCode(singleCodes[i])]);
  }
  for (let i = 0; i < dict.extendedSlots.length; i++) {
    pairs.push([dict.extendedSlots[i], extendedPrefix + String.fromCharCode(i + extendedOffset)]);
  }
  return pairs;
}

const v1Pairs = buildPairs(v1Dictionary);
const overlayPairs = buildPairs(overlayDictionary, [0x1e, 0x7f], "\x1f", 0x20);

function buildTrie(pairs, reversed = false) {
  const root = { children: new Map() };
  for (const [from, to] of pairs) {
    const match = reversed ? to : from;
    const replacement = reversed ? from : to;
    let node = root;
    for (const char of match) {
      let child = node.children.get(char);
      if (!child) {
        child = { children: new Map() };
        node.children.set(char, child);
      }
      node = child;
    }
    node.replacement ??= replacement;
  }
  return root;
}

function applyTrie(text, trie) {
  const out = [];
  let index = 0;
  while (index < text.length) {
    let node = trie;
    let cursor = index;
    let replacement;
    let replacementLength = 0;
    while (cursor < text.length) {
      node = node.children.get(text[cursor]);
      if (!node) break;
      cursor++;
      if (node.replacement !== undefined) {
        replacement = node.replacement;
        replacementLength = cursor - index;
      }
    }
    if (replacement !== undefined) {
      out.push(replacement);
      index += replacementLength;
    } else {
      out.push(text[index]);
      index++;
    }
  }
  return out.join("");
}

const v1EncodeTrie = buildTrie(v1Pairs);
const overlayEncodeTrie = buildTrie(overlayPairs);

function brotli(input) {
  return brotliCompressSync(Buffer.from(input), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
}

function baseBmpChars(byteLength) {
  return 3 + Math.ceil((byteLength * 8) / Math.log2(BMP_BASE_SIZE));
}

function discordFraming({ host = "https://agent-render.com", label = "Artifact", tag = "c" } = {}) {
  const open = `[${label}](${host}#${tag}`;
  const close = ")";
  return {
    open,
    close,
    framingLength: open.length + close.length,
    payloadBudget: DISCORD_MESSAGE_MAX - open.length - close.length,
  };
}

function trimOptional(fields) {
  let end = fields.length;
  while (end > 0 && (fields[end - 1] === undefined || fields[end - 1] === null)) end -= 1;
  return fields.slice(0, end);
}

function artifactTuple(artifact) {
  switch (artifact.kind) {
    case "markdown":
      return trimOptional(["m", artifact.id, artifact.content, artifact.title, artifact.filename]);
    case "code":
      return trimOptional(["c", artifact.id, artifact.content, artifact.language, artifact.title, artifact.filename]);
    case "csv":
      return trimOptional(["s", artifact.id, artifact.content, artifact.title, artifact.filename]);
    case "json":
      return trimOptional(["j", artifact.id, artifact.content, artifact.title, artifact.filename]);
    default:
      throw new Error(`unsupported kind ${artifact.kind}`);
  }
}

function tupleEnvelope(envelope) {
  const artifacts = envelope.artifacts.map(artifactTuple);
  if (artifacts.length === 1) return trimOptional([3, artifacts[0], envelope.title]);
  return trimOptional([2, artifacts, envelope.title]);
}

function encodeArx3Substituted(envelope) {
  const tupleJson = JSON.stringify(tupleEnvelope({ ...envelope, codec: "arx3" }));
  return applyTrie(applyTrie(tupleJson, overlayEncodeTrie), v1EncodeTrie);
}

function textEnvelope(kind, title, content, extra = {}) {
  return {
    v: 1,
    codec: "plain",
    title,
    activeArtifactId: "a",
    artifacts: [{ id: "a", kind, title, filename: extra.filename ?? "artifact.txt", content, ...extra }],
  };
}

function repeatedFixture(block, targetLength, segmentSuffix = (index) => `\nfixture segment ${index}\n`) {
  let fixture = "";
  let index = 0;
  while (fixture.length < targetLength) {
    fixture += `${block}${segmentSuffix(index)}`;
    index++;
  }
  return Array.from(fixture).slice(0, targetLength).join("");
}

function writeVarint(n) {
  const bytes = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from(bytes);
}

function pack(bytes) {
  const brotliBytes = Buffer.isBuffer(bytes) ? brotli(bytes).length : brotli(bytes).length;
  return { brotliBytes, bmpChars: baseBmpChars(brotliBytes) };
}

function packRaw(raw) {
  const compressed = brotli(raw);
  return { brotliBytes: compressed.length, bmpChars: baseBmpChars(compressed.length), rawBytes: Buffer.byteLength(raw) };
}

// ─── Silly cut A: implied envelope ───────────────────────────────────────────
// Wire: 1-byte kind + raw UTF-8 content. Title/id/filename implied or in label.

const KIND_BYTE = { markdown: 1, code: 2, csv: 3, json: 4 };

function encodeImplied(envelope) {
  const a = envelope.artifacts[0];
  return Buffer.concat([Buffer.from([KIND_BYTE[a.kind] ?? 0]), Buffer.from(a.content, "utf8")]);
}

// ─── Silly cut B: kind-specific IR ───────────────────────────────────────────

/** Markdown IR: collapse blank lines, strip trailing spaces, normalize headings. */
function markdownIr(content) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^#{1,6}\s+/gm, (m) => m.trimEnd() + " ")
    .trim() + "\n";
}

/** JSON IR: parse → sorted keys → compact; also emit key-dictionary form. */
function jsonIr(content) {
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    return { compact: content, keyed: null };
  }
  const compact = JSON.stringify(value);
  const keys = new Set();
  function walk(v) {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v)) {
        keys.add(k);
        walk(child);
      }
    }
  }
  walk(value);
  const keyList = [...keys].sort();
  const keyIndex = new Map(keyList.map((k, i) => [k, i]));
  function rewrite(v) {
    if (Array.isArray(v)) return v.map(rewrite);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, child] of Object.entries(v)) {
        out[String(keyIndex.get(k))] = rewrite(child);
      }
      return out;
    }
    return v;
  }
  const keyed = JSON.stringify({ k: keyList, v: rewrite(value) });
  return { compact, keyed };
}

/** CSV IR: detect delimiter, store header once, then row tuples as TSV. */
function csvIr(content) {
  const lines = content.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length < 2) return content;
  const header = lines[0];
  const delim = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
  const cols = header.split(delim).length;
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(delim);
    while (cells.length < cols) cells.push("");
    return cells.slice(0, cols).join("\t");
  });
  return `C${cols}\n${header}\n${rows.join("\n")}`;
}

function encodeKindIr(envelope) {
  const a = envelope.artifacts[0];
  let body = a.content;
  if (a.kind === "markdown") body = markdownIr(a.content);
  else if (a.kind === "json") {
    const ir = jsonIr(a.content);
    body = ir.keyed ?? ir.compact;
  } else if (a.kind === "csv") body = csvIr(a.content);
  else if (a.kind === "code") {
    // Light IR: strip trailing whitespace, collapse 3+ blank lines
    body = a.content.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  }
  return Buffer.concat([Buffer.from([KIND_BYTE[a.kind] ?? 0]), Buffer.from(body, "utf8")]);
}

// ─── Silly cut C: pre-shared chunk prior ─────────────────────────────────────
// Build a prior from ARX dict slots + fixture scaffolding. Chunk content with
// fixed-size windows; replace exact prior matches with 2-byte IDs.

function buildChunkPrior(extraTexts = []) {
  const chunks = new Map(); // hash16 → text
  const sources = [
    ...v1Dictionary.singleByteSlots,
    ...v1Dictionary.extendedSlots,
    ...overlayDictionary.singleByteSlots,
    ...overlayDictionary.extendedSlots,
    ...extraTexts,
  ];
  // Also index sliding windows of common sizes from sources
  for (const src of sources) {
    if (!src || src.length < 8) {
      if (src && src.length >= 4) {
        const h = hash16(src);
        if (!chunks.has(h)) chunks.set(h, src);
      }
      continue;
    }
    for (const size of [16, 32, 48, 64]) {
      for (let i = 0; i + size <= src.length; i += Math.max(8, size >> 2)) {
        const slice = src.slice(i, i + size);
        const h = hash16(slice);
        if (!chunks.has(h)) chunks.set(h, slice);
      }
    }
  }
  return chunks;
}

function hash16(text) {
  const digest = createHash("sha1").update(text, "utf8").digest();
  return (digest[0] << 8) | digest[1];
}

/**
 * Greedy longest-match against prior. Wire:
 *   0x00 + u16be id  → prior hit
 *   0x01 + varint n + n bytes → literal
 */
function encodeChunkPrior(content, prior) {
  const sizes = [64, 48, 32, 16, 12, 8];
  const out = [];
  let i = 0;
  // Invert prior: text → id (prefer longer)
  const byText = new Map();
  for (const [id, text] of prior) {
    const prev = byText.get(text);
    if (prev === undefined || text.length > prior.get(prev)?.length) byText.set(text, id);
  }
  while (i < content.length) {
    let hit = null;
    for (const size of sizes) {
      if (i + size > content.length) continue;
      const slice = content.slice(i, i + size);
      const id = byText.get(slice);
      if (id !== undefined) {
        hit = { id, size };
        break;
      }
    }
    if (hit) {
      out.push(0x00, (hit.id >> 8) & 0xff, hit.id & 0xff);
      i += hit.size;
    } else {
      // Emit a run of literals until next potential hit or 64 chars
      let end = i + 1;
      while (end < content.length && end - i < 64) {
        let found = false;
        for (const size of sizes) {
          if (end + size <= content.length && byText.has(content.slice(end, end + size))) {
            found = true;
            break;
          }
        }
        if (found) break;
        end++;
      }
      const lit = Buffer.from(content.slice(i, end), "utf8");
      out.push(0x01, ...writeVarint(lit.length), ...lit);
      i = end;
    }
  }
  return Buffer.from(out);
}

// ─── Silly cut D: template / skeleton delta ──────────────────────────────────

const MARKDOWN_SKELETON = [
  "# ",
  "\n\n## ",
  "\n\n### ",
  "\n\n- ",
  "\n\n```",
  "\n```\n",
  "\n\n| ",
  " | ",
  " |\n",
  "agent-render",
  "Discord",
  "fragment",
  "artifact",
].join("");

const CODE_SKELETON = [
  "export function ",
  "export async function ",
  "export const ",
  "import { ",
  '} from "',
  "return ",
  "if (!",
  "await ",
  "const ",
  "function ",
].join("");

function simpleDelta(content, skeleton) {
  // Myers-ish is overkill; use a cheap "remove skeleton substrings in order" +
  // store residual with skeleton id. Better: store content with skeleton as
  // Brotli shared-dict proxy via concatenation residual estimate, AND a real
  // strip-and-mark encoding.
  let residual = content;
  const marks = [];
  for (const token of skeleton.match(/.{1,24}/g) ?? []) {
    let idx;
    while ((idx = residual.indexOf(token)) !== -1) {
      marks.push([idx, token.length]);
      residual = residual.slice(0, idx) + residual.slice(idx + token.length);
      if (marks.length > 200) break;
    }
    if (marks.length > 200) break;
  }
  // Wire: skeleton-id (1) + varint residualLen + residual + mark count + marks
  const resBuf = Buffer.from(residual, "utf8");
  const markBuf = Buffer.alloc(marks.length * 4);
  marks.forEach(([idx, len], i) => {
    markBuf.writeUInt16BE(Math.min(idx, 0xffff), i * 4);
    markBuf.writeUInt16BE(Math.min(len, 0xffff), i * 4 + 2);
  });
  return Buffer.concat([
    Buffer.from([1]),
    writeVarint(resBuf.length),
    resBuf,
    writeVarint(marks.length),
    markBuf,
  ]);
}

// ─── Silly cut E: lossy readable-enough ──────────────────────────────────────

function lossyMarkdown(content) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // Drop markdown emphasis markers (lossy but often still readable)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Collapse table alignment rows
    .replace(/^\|[-:| ]+\|$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

function lossyCode(content) {
  return content
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    // Strip line comments (aggressive / silly)
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim() + "\n";
}

// ─── Silly cut F: label-as-bitstream ─────────────────────────────────────────
// Discord label can carry title/id; fragment only needs content.
// Measure: implied content pack + short label carrying title.

function labelBitstreamSavings(envelope, contentBmpChars) {
  const title = envelope.title || envelope.artifacts[0].title || "a";
  // Shorten title to fit; use first grapheme-ish chars
  const shortLabel = Array.from(title).slice(0, 24).join("") || "a";
  const withTitleInEnvelope = discordFraming({ label: "a", tag: "c" });
  // Envelope that still carries title in payload uses short label "a"
  const titleInPayloadFraming = withTitleInEnvelope.framingLength;
  // Title in label: longer framing, but payload can drop title field (~title.length + JSON quotes)
  const titleInLabelFraming = discordFraming({ label: shortLabel, tag: "c" }).framingLength;
  // Approximate payload title overhead in ARX3 tuple JSON
  const titleOverheadChars = JSON.stringify(title).length + 1; // rough
  const titleOverheadBmp = Math.ceil(titleOverheadChars * 0.15); // after brotli+bmp, rough
  return {
    shortLabel,
    framingWithTitleInLabel: titleInLabelFraming,
    framingWithShortLabel: titleInPayloadFraming,
    framingDelta: titleInLabelFraming - titleInPayloadFraming,
    approxPayloadBmpSaved: titleOverheadBmp,
    netDiscordDelta: titleInLabelFraming - titleInPayloadFraming - titleOverheadBmp,
    contentBmpChars,
  };
}

// ─── Silly cut G: mosaic multipart ───────────────────────────────────────────

function mosaicMath(bmpChars, { host = "https://agent-render.com", labelPrefix = "p" } = {}) {
  const parts = [];
  let remaining = bmpChars;
  let part = 0;
  while (remaining > 0 && part < 20) {
    const label = `${labelPrefix}${part}`;
    const { payloadBudget, framingLength } = discordFraming({ host, label, tag: "c" });
    const take = Math.min(remaining, payloadBudget);
    parts.push({ part, label, framingLength, payloadBudget, take });
    remaining -= take;
    part++;
  }
  // Discord reality: each link is a separate message OR one message with N links.
  // One message with N links: sum of all link lengths ≤ 2000.
  let packedInOne = 0;
  let used = 0;
  for (const p of parts) {
    const linkLen = p.framingLength + p.take;
    if (used + linkLen + (packedInOne > 0 ? 1 : 0) > DISCORD_MESSAGE_MAX) break;
    used += linkLen + (packedInOne > 0 ? 1 : 0);
    packedInOne++;
  }
  return {
    partsNeededSeparateMessages: parts.length,
    partsFittingOneMessage: packedInOne,
    totalBmpChars: bmpChars,
    capacityOneMessage: parts.slice(0, packedInOne).reduce((n, p) => n + p.take, 0),
    capacityNMessages: parts.reduce((n, p) => n + p.take, 0),
  };
}

// ─── Silly cut H: hybrid fence ───────────────────────────────────────────────
// Message: [a](https://host/#cSHORT) + ```arx\nPAYLOAD\n```
// Short URL can be a stub/hash; fence carries the bulk (still in Discord message).

function hybridFenceMath(bmpChars, { host = "https://agent-render.com", stubChars = 12 } = {}) {
  const stubLink = discordFraming({ host, label: "a", tag: "c" });
  const stubTotal = stubLink.framingLength + stubChars;
  const fenceOverhead = "```".length + FENCE_TAG.length + 1 + 1 + "```".length; // ```arx\n ... \n```
  const fenceBudget = DISCORD_MESSAGE_MAX - stubTotal - 1 - fenceOverhead; // space between
  return {
    stubTotal,
    fenceOverhead,
    fenceBudget,
    fitsInOneMessage: bmpChars <= fenceBudget,
    overflow: Math.max(0, bmpChars - fenceBudget),
    // Fence payload is raw baseBMP digits — same density, but no URL encoding issues
    // and Discord may count the same UTF-16 units.
    effectiveBudgetVsPureLink: fenceBudget - stubLink.payloadBudget,
  };
}

// ─── Silly cut I: BPE-ish word pack ──────────────────────────────────────────

function trainWordTable(texts, maxTokens = 512) {
  const counts = new Map();
  for (const text of texts) {
    for (const word of text.split(/(\s+|[^a-zA-Z0-9_]+)/)) {
      if (!word || word.length < 2) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] * b[0].length - a[1] * a[0].length)
    .slice(0, maxTokens)
    .map(([w]) => w);
}

function encodeWordPack(content, table) {
  const index = new Map(table.map((w, i) => [w, i]));
  // Sort by length desc for greedy
  const sorted = [...table].sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (i < content.length) {
    let hit = null;
    for (const w of sorted) {
      if (content.startsWith(w, i)) {
        hit = index.get(w);
        out.push(0x80 | ((hit >> 8) & 0x7f), hit & 0xff);
        i += w.length;
        break;
      }
    }
    if (hit === null) {
      // literal byte run
      let end = i + 1;
      while (end < content.length && end - i < 127) {
        let found = false;
        for (const w of sorted) {
          if (content.startsWith(w, end)) {
            found = true;
            break;
          }
        }
        if (found) break;
        end++;
      }
      const lit = Buffer.from(content.slice(i, end), "utf8");
      out.push(lit.length & 0x7f, ...lit);
      i = end;
    }
  }
  // Prepend table is NOT in wire — assumed shared prior. Just the stream.
  return Buffer.from(out);
}

// ─── Corpus ──────────────────────────────────────────────────────────────────

const markdownAgentsFixture = repeatedFixture(
  [
    "# AGENTS.md excerpt",
    "",
    "`agent-render` is a static artifact viewer for AI-generated outputs.",
    "Keep markdown, code, diffs, CSV, and JSON readable across chat surfaces.",
    "",
    "## Product contract",
    "",
    "- Fragment payloads use `#agent-render=v1.<codec>.<payload>`.",
    "- Artifact contents stay out of the host request path.",
    "- Supported codecs are `plain`, `lz`, `deflate`, `arx`, `arx2`, and `arx3`.",
    "- Supported artifact kinds are `markdown`, `code`, `diff`, `csv`, and `json`.",
    "",
    "Preserve the static shell, the zero-retention wording, and the renderer-first layout.",
    "",
  ].join("\n"),
  8000,
  (index) =>
    `\nFixture note ${index}: fragment transport, renderer readiness, and artifact metadata stay aligned.\n\n`,
);

const codeFragmentFixture = repeatedFixture(
  [
    "export async function decodeFragmentAsync(hash: string, options?: DecodeOptions) {",
    "  const parsed = parseFragmentPrefix(hash);",
    "  if (!parsed.ok) return parsed;",
    '  if (parsed.codec === "arx" || parsed.codec === "arx2") {',
    '    const { decodeArxFragmentAsync } = await import("./fragment-arx");',
    "    return decodeArxFragmentAsync(parsed, options);",
    "  }",
    "  return decodePlainFragment(parsed.payload, options);",
    "}",
    "",
  ].join("\n"),
  8000,
  (index) => `\n// fixture segment ${index}: codec branch coverage and bundle shape stay stable.\n`,
);

const packageManifestFixture = JSON.stringify(
  {
    name: "agent-render",
    version: "0.1.0",
    private: true,
    scripts: { build: "next build", check: "npm run lint && npm run test" },
    dependencies: { next: "15.1.11", react: "19.1.0", "brotli-wasm": "^3.0.1" },
  },
  null,
  2,
);

const csvFixture = [
  "model,avg,delta,tasks,wins",
  "gpt-5.5,93.91,0,25,7",
  "mimo/mimo-v2.5-pro,93.29,-0.61,25,5",
  "Kimi-K2.6-Turbo,91.63,-2.28,25,5",
  "synthetic/GLM-5.1,89.07,-4.84,25,5",
  "gpt-5.3-codex-spark,88.68,-5.23,25,3",
  "gpt-5.4-mini,88.19,-5.72,25,3",
].join("\n");

const corpus = [
  {
    name: "markdown-agents",
    envelope: textEnvelope("markdown", "AGENTS.md excerpt", markdownAgentsFixture, { filename: "AGENTS.md" }),
  },
  {
    name: "code-bench-report",
    envelope: textEnvelope("markdown", "Baanish Code Bench", codeBenchReportFixture, { filename: "results.md" }),
  },
  {
    name: "code-fragment",
    envelope: textEnvelope("code", "fragment.ts excerpt", codeFragmentFixture, {
      filename: "fragment.ts",
      language: "ts",
    }),
  },
  {
    name: "json-package",
    envelope: textEnvelope("json", "package.json", packageManifestFixture, { filename: "package.json" }),
  },
  {
    name: "csv-leaderboard",
    envelope: textEnvelope("csv", "Leaderboard", csvFixture, { filename: "board.csv" }),
  },
  {
    name: "small-markdown",
    envelope: textEnvelope(
      "markdown",
      "Note",
      [
        "# Sprint notes",
        "",
        "- Ship ARX3 visible URL mode",
        "- Keep Discord markdown links under 2000 chars",
        "- Prefer fragment transport over UUID mode for zero-retention",
        "",
        "```ts",
        "export const value = 1;",
        "```",
        "",
      ].join("\n"),
      { filename: "notes.md" },
    ),
  },
];

// Priors:
//   cold  = ARX dict slots only (shipped today — honest baseline)
//   loo   = leave-one-out corpus (channel-pinned mother dict, held-out target)
//   warm  = full corpus including target (optimistic ceiling / contamination)
const allContents = corpus.map((c) => c.envelope.artifacts[0].content);
const coldChunkPrior = buildChunkPrior([]);
const warmChunkPrior = buildChunkPrior(allContents);
const coldWordTable = trainWordTable(
  [...v1Dictionary.singleByteSlots, ...overlayDictionary.singleByteSlots, ...overlayDictionary.extendedSlots],
  512,
);
const warmWordTable = trainWordTable(allContents, 512);

function leaveOneOutContents(skipIndex) {
  return allContents.filter((_, i) => i !== skipIndex);
}

function pct(from, to) {
  if (from == null || to == null) return null;
  return ((to - from) / from) * 100;
}

function fmtDelta(from, to) {
  const p = pct(from, to);
  if (p == null || Number.isNaN(p)) return "n/a";
  if (p === 0) return "0.0%";
  return `${p < 0 ? "−" : "+"}${Math.abs(p).toFixed(1)}%`;
}

function measureRow(envelope, fixtureIndex) {
  const content = envelope.artifacts[0].content;
  const kind = envelope.artifacts[0].kind;
  const arx3 = packRaw(encodeArx3Substituted(envelope));

  const implied = packRaw(encodeImplied(envelope));
  const kindIr = packRaw(encodeKindIr(envelope));

  const looChunkPrior = buildChunkPrior(leaveOneOutContents(fixtureIndex));
  const looWordTable = trainWordTable(leaveOneOutContents(fixtureIndex), 512);

  function chunkImpliedWith(prior) {
    const encoded = encodeChunkPrior(content, prior);
    return packRaw(Buffer.concat([Buffer.from([KIND_BYTE[kind] ?? 0]), encoded]));
  }
  function wordPackWith(table) {
    return packRaw(Buffer.concat([Buffer.from([KIND_BYTE[kind] ?? 0]), encodeWordPack(content, table)]));
  }

  const chunkCold = chunkImpliedWith(coldChunkPrior);
  const chunkLoo = chunkImpliedWith(looChunkPrior);
  const chunkWarm = chunkImpliedWith(warmChunkPrior);
  const wordCold = wordPackWith(coldWordTable);
  const wordLoo = wordPackWith(looWordTable);
  const wordWarm = wordPackWith(warmWordTable);

  const skeleton = kind === "code" ? CODE_SKELETON : MARKDOWN_SKELETON;
  const deltaPack = packRaw(simpleDelta(content, skeleton));

  let lossyContent = content;
  if (kind === "markdown") lossyContent = lossyMarkdown(content);
  else if (kind === "code") lossyContent = lossyCode(content);
  const lossyPack = packRaw(Buffer.concat([Buffer.from([KIND_BYTE[kind] ?? 0]), Buffer.from(lossyContent, "utf8")]));

  // Combined: kind IR → leave-one-out chunk prior
  const irBody = encodeKindIr(envelope).subarray(1).toString("utf8");
  const sillyStack = packRaw(
    Buffer.concat([Buffer.from([KIND_BYTE[kind] ?? 0]), encodeChunkPrior(irBody, looChunkPrior)]),
  );

  const label = labelBitstreamSavings(envelope, arx3.bmpChars);
  const mosaic = mosaicMath(arx3.bmpChars);
  const hybrid = hybridFenceMath(arx3.bmpChars);

  const framing = discordFraming();
  const fits = (bmp) => bmp <= framing.payloadBudget;

  return {
    rawContentChars: content.length,
    arx3,
    implied,
    kindIr,
    chunkCold,
    chunkLoo,
    chunkWarm,
    wordCold,
    wordLoo,
    wordWarm,
    templateDelta: deltaPack,
    lossy: lossyPack,
    sillyStack,
    label,
    mosaic,
    hybrid,
    priorSizes: {
      coldChunks: coldChunkPrior.size,
      looChunks: looChunkPrior.size,
      warmChunks: warmChunkPrior.size,
      coldWords: coldWordTable.length,
      looWords: looWordTable.length,
      warmWords: warmWordTable.length,
    },
    fitsDiscord: {
      arx3: fits(arx3.bmpChars),
      bestHonest: fits(
        Math.min(arx3.bmpChars, implied.bmpChars, kindIr.bmpChars, chunkLoo.bmpChars, wordLoo.bmpChars),
      ),
      lossy: fits(lossyPack.bmpChars),
    },
  };
}

const t0 = performance.now();
const rows = corpus.map((item, index) => ({ name: item.name, ...measureRow(item.envelope, index) }));
const elapsed = performance.now() - t0;

/**
 * Capacity probe uses *unique* prose (index-salted) so Brotli cannot collapse
 * the whole payload into a tiny repeat — matches the ideation probe's hard case.
 */
function uniqueProse(targetLength) {
  const sentences = [
    "Fragment transport keeps artifact bodies off the host request path.",
    "Discord markdown links gate on UTF-16 units, not optimistic code points.",
    "Shared priors only help when encoder and decoder pin the same version.",
    "Mosaic assemblers multiply budget across messages, not within one.",
    "Kind-specific IR is plumbing; it is not a denser alphabet.",
  ];
  let out = "";
  let i = 0;
  while (out.length < targetLength) {
    const s = sentences[i % sentences.length];
    out += `${s} [${i.toString(36)}:${(i * 7919).toString(16)}] `;
    if (i % 7 === 0) out += "\n\n";
    i++;
  }
  return Array.from(out).slice(0, targetLength).join("");
}

function capacitySearch(encodeFn, { label = "a", budget = null, hi = 120_000 } = {}) {
  const framing = discordFraming({ label, tag: "c" });
  const limit = budget ?? framing.payloadBudget;
  let lo = 100;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const env = textEnvelope("markdown", "cap", uniqueProse(mid));
    const packed = encodeFn(env);
    if (packed.bmpChars <= limit) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

// For capacity chunk/word packs: prior from dict + bench fixtures (not the synthetic prose)
const capacityChunkPrior = buildChunkPrior(allContents);
const capacityWordTable = trainWordTable(allContents, 512);

const capacity = {
  arx3: capacitySearch((env) => packRaw(encodeArx3Substituted(env))),
  implied: capacitySearch((env) => packRaw(encodeImplied(env))),
  kindIr: capacitySearch((env) => packRaw(encodeKindIr(env))),
  chunkCold: capacitySearch((env) => {
    const content = env.artifacts[0].content;
    return packRaw(Buffer.concat([Buffer.from([1]), encodeChunkPrior(content, coldChunkPrior)]));
  }),
  chunkPinned: capacitySearch((env) => {
    const content = env.artifacts[0].content;
    return packRaw(Buffer.concat([Buffer.from([1]), encodeChunkPrior(content, capacityChunkPrior)]));
  }),
  wordPinned: capacitySearch((env) => {
    const content = env.artifacts[0].content;
    return packRaw(Buffer.concat([Buffer.from([1]), encodeWordPack(content, capacityWordTable)]));
  }),
  lossy: capacitySearch((env) => {
    const body = lossyMarkdown(env.artifacts[0].content);
    return packRaw(Buffer.concat([Buffer.from([1]), Buffer.from(body, "utf8")]));
  }),
};

const singleCap = capacity.arx3;
const mosaic3Cap = singleCap * 3;

const hybridBudget = hybridFenceMath(0).fenceBudget;
const hybridCap = capacitySearch((env) => packRaw(encodeArx3Substituted(env)), { budget: hybridBudget });

// ─── Report ──────────────────────────────────────────────────────────────────

const lines = [];
const w = (s = "") => lines.push(s);

w("# ARX4 silly cuts — unconventional Discord packing");
w();
w("_Experimental notes from `scripts/bench-arx4-silly.mjs`. Not a shipped codec._");
w();
w("## Why this pass");
w();
w("Bet #2 (binary envelopes + real Brotli `-D`) topped out around **~0–2%** vs ARX3.");
w("Wire density is already ~99.5% of the 16-bit UTF-16 ceiling. Alphabet and residual-dict");
w("tweaks are exhausted. This pass looks for **deeper / sillier** levers:");
w();
w("- shared priors the *viewer already knows* (chunks, word tables, templates)");
w("- kind-specific IR and lossy readable-enough transforms");
w("- Discord UX bends (mosaic links, fence hybrid, label-as-bitstream)");
w("- implied envelopes that drop metadata from the fragment");
w();
w("## Ideas measured");
w();
w("| Cut | Idea | Lossless? | Product tension |");
w("| --- | --- | :---: | --- |");
w("| A | **Implied envelope** — 1-byte kind + raw content | yes | drops id/title/filename from fragment |");
w("| B | **Kind IR** — md normalize / JSON key-dict / CSV columnar | mostly | kind-specific decoders |");
w("| C | **Chunk prior** — CDC-ish windows → 2-byte IDs vs shared prior | yes* | prior must be pinned/versioned |");
w("| D | **Template delta** — strip known skeleton, store residual+marks | yes* | skeleton catalog |");
w("| E | **Lossy readable** — collapse ws, strip emphasis/comments | no | quality trade |");
w("| F | **Label bitstream** — put title in Discord `[label]` | yes | label UX / length |");
w("| G | **Mosaic** — N markdown links / N messages | yes | multi-click UX |");
w("| H | **Hybrid fence** — stub URL + ` ```arx ` payload in same message | yes | not pure-link; scanners differ |");
w("| I | **Word pack** — corpus BPE-ish token table → id stream | yes* | shared vocab |");
w();
w("\\* Lossless only if encoder and decoder share the same prior/vocab/skeleton version.");
w();
w(`Prior sizes this run: cold chunks **${coldChunkPrior.size}**, warm chunks **${warmChunkPrior.size}**, cold words **${coldWordTable.length}**, warm words **${warmWordTable.length}**.`);
w("Leave-one-out (LOO) priors exclude the measured fixture — that is the honest “pinned mother dict” estimate.");
w();

w("## Per-fixture Brotli bytes (vs ARX3)");
w();
w(
  "| Fixture | raw | ARX3 | implied | kind IR | chunk cold | chunk LOO | chunk warm† | word LOO | lossy | silly stack (IR+LOO) |",
);
w("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const r of rows) {
  const b = r.arx3.brotliBytes;
  w(
    `| ${r.name} | ${r.rawContentChars} | ${b} | ${r.implied.brotliBytes} (${fmtDelta(b, r.implied.brotliBytes)}) | ${r.kindIr.brotliBytes} (${fmtDelta(b, r.kindIr.brotliBytes)}) | ${r.chunkCold.brotliBytes} (${fmtDelta(b, r.chunkCold.brotliBytes)}) | ${r.chunkLoo.brotliBytes} (${fmtDelta(b, r.chunkLoo.brotliBytes)}) | ${r.chunkWarm.brotliBytes} (${fmtDelta(b, r.chunkWarm.brotliBytes)}) | ${r.wordLoo.brotliBytes} (${fmtDelta(b, r.wordLoo.brotliBytes)}) | ${r.lossy.brotliBytes} (${fmtDelta(b, r.lossy.brotliBytes)}) | ${r.sillyStack.brotliBytes} (${fmtDelta(b, r.sillyStack.brotliBytes)}) |`,
  );
}
w();
w("† **chunk warm** includes the target fixture in the prior — contamination ceiling, not a real win.");

w();
w("## Per-fixture visible BMP chars (vs ARX3)");
w();
w(
  "| Fixture | ARX3 BMP | implied | kind IR | chunk LOO | word LOO | lossy | best honest | Discord fit |",
);
w("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |");
for (const r of rows) {
  const b = r.arx3.bmpChars;
  const best = Math.min(
    r.arx3.bmpChars,
    r.implied.bmpChars,
    r.kindIr.bmpChars,
    r.chunkLoo.bmpChars,
    r.wordLoo.bmpChars,
    r.sillyStack.bmpChars,
  );
  w(
    `| ${r.name} | ${b} | ${r.implied.bmpChars} (${fmtDelta(b, r.implied.bmpChars)}) | ${r.kindIr.bmpChars} (${fmtDelta(b, r.kindIr.bmpChars)}) | ${r.chunkLoo.bmpChars} (${fmtDelta(b, r.chunkLoo.bmpChars)}) | ${r.wordLoo.bmpChars} (${fmtDelta(b, r.wordLoo.bmpChars)}) | ${r.lossy.bmpChars} (${fmtDelta(b, r.lossy.bmpChars)}) | ${best} (${fmtDelta(b, best)}) | ${r.fitsDiscord.arx3 ? "yes" : "no"} |`,
  );
}

// Totals
function sum(sel) {
  return rows.reduce((n, r) => n + sel(r), 0);
}
w();
w("## Corpus totals");
w();
w("| Variant | Σ brotli | Σ BMP | vs ARX3 BMP |");
w("| --- | ---: | ---: | ---: |");
const variants = [
  ["ARX3 (baseline)", (r) => r.arx3],
  ["A implied envelope", (r) => r.implied],
  ["B kind IR", (r) => r.kindIr],
  ["C chunk cold (dict only)", (r) => r.chunkCold],
  ["C chunk LOO (pinned, held-out)", (r) => r.chunkLoo],
  ["C chunk warm† (contaminated)", (r) => r.chunkWarm],
  ["D template delta", (r) => r.templateDelta],
  ["E lossy readable", (r) => r.lossy],
  ["I word cold", (r) => r.wordCold],
  ["I word LOO", (r) => r.wordLoo],
  ["I word warm†", (r) => r.wordWarm],
  ["B+C silly stack (IR+LOO)", (r) => r.sillyStack],
];
const arx3BmpTotal = sum((r) => r.arx3.bmpChars);
for (const [name, sel] of variants) {
  const brotliSum = sum((r) => sel(r).brotliBytes);
  const bmpSum = sum((r) => sel(r).bmpChars);
  w(`| ${name} | ${brotliSum} | ${bmpSum} | ${fmtDelta(arx3BmpTotal, bmpSum)} |`);
}

w();
w("## Discord UX bends (not pure single-fragment)");
w();
w("### F — Label as bitstream");
w();
w("Moving the title into `[label]` saves a little payload but costs framing chars.");
w("Net is usually a wash or a loss for short titles; only interesting for long titles");
w("that Brotli would not have collapsed much.");
w();
w("| Fixture | short label | framing Δ | approx payload BMP saved | net Discord Δ |");
w("| --- | --- | ---: | ---: | ---: |");
for (const r of rows) {
  const L = r.label;
  w(
    `| ${r.name} | \`${L.shortLabel.replace(/\|/g, "\\|")}\` | ${L.framingDelta > 0 ? "+" : ""}${L.framingDelta} | ~${L.approxPayloadBmpSaved} | ${L.netDiscordDelta > 0 ? "+" : ""}${L.netDiscordDelta} |`,
  );
}

w();
w("### G — Mosaic multipart");
w();
w("Each Discord message still caps at 2000. Multiple messages multiply capacity;");
w("multiple links *in one message* mostly fight over the same 2000 budget.");
w();
w("| Fixture | ARX3 BMP | parts if separate msgs | parts fitting one msg | 1-msg capacity |");
w("| --- | ---: | ---: | ---: | ---: |");
for (const r of rows) {
  const m = r.mosaic;
  w(
    `| ${r.name} | ${m.totalBmpChars} | ${m.partsNeededSeparateMessages} | ${m.partsFittingOneMessage} | ${m.capacityOneMessage} |`,
  );
}
w();
w(
  `Unique-prose capacity ×3 separate messages (approx): **~${(mosaic3Cap / 1000).toFixed(0)}k** chars vs single-link **~${(singleCap / 1000).toFixed(0)}k**.`,
);

w();
w("### H — Hybrid stub URL + code fence");
w();
w("Same Discord message: a tiny markdown link (deeplink / stub) plus a fenced payload.");
w("Fence digits use the same BMP alphabet; overhead is fence markers, not URL framing.");
w();
const href = hybridFenceMath(0);
w(`| Stub link chars | Fence overhead | Fence payload budget | vs pure-link budget |`);
w(`| ---: | ---: | ---: | ---: |`);
w(
  `| ${href.stubTotal} | ${href.fenceOverhead} | ${href.fenceBudget} | ${href.effectiveBudgetVsPureLink > 0 ? "+" : ""}${href.effectiveBudgetVsPureLink} |`,
);
w();
w("| Fixture | ARX3 BMP | fits hybrid fence? | overflow |");
w("| --- | ---: | :---: | ---: |");
for (const r of rows) {
  w(
    `| ${r.name} | ${r.arx3.bmpChars} | ${r.hybrid.fitsInOneMessage ? "yes" : "no"} | ${r.hybrid.overflow} |`,
  );
}

w();
w("## Discord capacity (unique prose, binary search)");
w();
w("Largest *index-salted* prose string whose encoded form fits one Discord message");
w("(current-host framing). Unique salts stop Brotli from collapsing tiled repeats —");
w("this is the hard case, not the highly-repetitive search-cap case.");
w();
w("| Approach | Max raw chars | vs ARX3 |");
w("| --- | ---: | ---: |");
w(`| ARX3 single link | ${capacity.arx3} | 0.0% |`);
w(`| A implied | ${capacity.implied} | ${fmtDelta(capacity.arx3, capacity.implied)} |`);
w(`| B kind IR | ${capacity.kindIr} | ${fmtDelta(capacity.arx3, capacity.kindIr)} |`);
w(`| C chunk cold | ${capacity.chunkCold} | ${fmtDelta(capacity.arx3, capacity.chunkCold)} |`);
w(`| C chunk pinned (fixtures prior) | ${capacity.chunkPinned} | ${fmtDelta(capacity.arx3, capacity.chunkPinned)} |`);
w(`| I word pinned | ${capacity.wordPinned} | ${fmtDelta(capacity.arx3, capacity.wordPinned)} |`);
w(`| E lossy | ${capacity.lossy} | ${fmtDelta(capacity.arx3, capacity.lossy)} |`);
w(`| H hybrid fence (ARX3 bytes) | ${hybridCap} | ${fmtDelta(capacity.arx3, hybridCap)} |`);
w(`| G mosaic ×3 messages (approx) | ~${mosaic3Cap} | ${fmtDelta(capacity.arx3, mosaic3Cap)} |`);

w();
w("## Interpretation — what actually moves the needle");
w();
w("### Still inside one fragment + one link");
w();
w("1. **Warm/contaminated chunk priors look magical (−70%+)** — ignore them. They prove only");
w("   that *if the decoder already has the bytes, you can send IDs*. That is a content-addressed");
w("   cache, not a compressor.");
w("2. **Leave-one-out chunk priors** are the real test for a channel-pinned mother dict.");
w("   Read the LOO column: wins only where fixtures share long windows with siblings");
w("   (small JSON/CSV/notes against a prior that saw similar scaffolding). Unique reports");
w("   (code-bench) should stay near ARX3 or regress once literals dominate.");
w("3. **Cold priors (shipped ARX dict slots only)** rarely beat ARX3+Brotli — substitution");
w("   already harvested that juice; re-encoding as chunk IDs adds framing.");
w("4. **Implied envelope + kind IR** are small, honest wins (metadata / normalize). Worth");
w("   keeping as plumbing if ARX4 happens; not a Discord unlock alone.");
w("5. **Template delta** as implemented is weak — Brotli already eats repeated skeletons;");
w("   a mark/residual scheme often *adds* overhead.");
w("6. **Lossy** helps when emphasis/comments/alignment rows are noise. Product call, not codec magic.");
w("7. **Word pack LOO** is milder than chunks; useful only with a large shared vocab that");
w("   actually overlaps the target (code keywords, markdown chrome).");
w();
w("### Break-the-box (Discord UX)");
w();
w("8. **Mosaic across messages** is the only lever that *multiplies* the 2000 budget.");
w("   One message with N links does **not** — they share the same 2000 chars.");
w("9. **Hybrid fence** is usually a wash or slight loss vs pure-link (stub steals budget);");
w("   it is interesting only as a *paste UX* agents already use, not as denser packing.");
w("10. **Label bitstream** is mostly a wash. Skip.");
w();
w("### Ranked silly bets (after this probe)");
w();
w("1. **Mosaic assembler** — explicit multi-message `1/3` protocol; multiplies capacity for real.");
w("2. **Versioned shared prior** — only if LOO / held-out benches still win on *your* domain");
w("   corpus (agent-render chat is repetitive; arbitrary user prose is not). Pair with a");
w("   pinned mother post or build-shipped prior — never trust warm numbers.");
w("3. **Hybrid fence profile** — optional surface for agents that already paste code blocks;");
w("   protocol bend, not a density win.");
w("4. **Implied + kind IR** — cheap plumbing alongside (1) or (2).");
w("5. **Lossy mode** — opt-in “readable enough” chat previews.");
w("6. Avoid more residual-Brotli-dict optimism, alphabet retunes, and contaminated prior benches.");
w();
w("## Non-goals reinforced");
w();
w("- Do not pretend corpus-trained priors generalize without a held-out / LOO gate.");
w("- Do not put artifact bodies in query params or require a backend for the core path.");
w("- Do not treat mosaic/fence as drop-in replacements for zero-click single links.");
w("- Do not update AGENTS.md / skills as if ARX4 ships.");
w();
w("## How to re-run");
w();
w("```bash");
w("npm run bench:arx4-silly");
w("# or: node scripts/bench-arx4-silly.mjs");
w("```");
w();
w(`_Generated in ${elapsed.toFixed(1)}ms._`);
w("See also `docs/arx4-ideation.md` and `docs/arx4-bet2-bench.md`.");

writeFileSync(REPORT_PATH, lines.join("\n") + "\n");
console.log(`Wrote ${REPORT_PATH}`);
console.log(`Fixtures: ${rows.length}, elapsed ${elapsed.toFixed(1)}ms`);
console.log(
  `ARX3 Σ BMP ${arx3BmpTotal}; LOO chunk Σ ${sum((r) => r.chunkLoo.bmpChars)} (${fmtDelta(arx3BmpTotal, sum((r) => r.chunkLoo.bmpChars))}); warm† Σ ${sum((r) => r.chunkWarm.bmpChars)} (${fmtDelta(arx3BmpTotal, sum((r) => r.chunkWarm.bmpChars))})`,
);
console.log(
  `Capacity ARX3=${capacity.arx3} implied=${capacity.implied} chunkCold=${capacity.chunkCold} chunkPinned=${capacity.chunkPinned} wordPinned=${capacity.wordPinned} hybrid=${hybridCap} mosaic3~${mosaic3Cap}`,
);
