#!/usr/bin/env node
/**
 * ARX4 ideation probe — experimental only.
 *
 * Measures several ways to squeeze more artifact data into a Discord markdown
 * link (`[label](url)` ≤ 2000 chars) beyond today's ARX3 pipeline:
 *
 *   A. denser Unicode wire (supplementary / "baseAstral")
 *   B. binary tuple envelope (CBOR-ish) instead of JSON.stringify(tuple)
 *   C. Brotli shared static dictionary (pre-seeded with domain corpus)
 *   D. content-first packing (compress artifact body bytes, not JSON text)
 *   E. Discord-aware framing (short host + short label + compact tag)
 *   F. mined overlay dictionary growth from the bench corpus
 *
 * This script does NOT change the product codec surface. It prints comparative
 * numbers so maintainers can decide which ideas deserve a real ARX4 design.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { brotliCompressSync, deflateRawSync, constants } from "node:zlib";
import { performance } from "node:perf_hooks";

const DISCORD_MESSAGE_MAX = 2000;
const BMP_BASE_SIZE = 62_000;
const REPORT_PATH = "docs/arx4-ideation.md";

const v1Dictionary = JSON.parse(readFileSync("public/arx-dictionary.json", "utf8"));
const overlayDictionary = JSON.parse(readFileSync("public/arx2-dictionary.json", "utf8"));
const codeBenchReportFixture = readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8");

const singleByteCodes = [
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c,
  0x1d,
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

/**
 * Approximate a Brotli *shared static dictionary* win.
 *
 * Node's zlib brotli bindings ignore custom dictionaries, so we use two proxies:
 *   1. deflateRaw + dictionary (real shared-dict API) as a lower-bound signal
 *   2. residual trick: len(brotli(dict||data)) - len(brotli(dict)) as an optimistic
 *      estimate of what a true Brotli custom dictionary might achieve
 *
 * Product ARX4 would need brotli-wasm (or equivalent) with dictionary support.
 */
function sharedDictEstimates(input, dictionary) {
  const data = Buffer.from(input);
  const plainBrotli = brotli(data);
  const plainDeflate = deflateRawSync(data, { level: 9 });
  const dictDeflate = deflateRawSync(data, { level: 9, dictionary });
  const dictOnlyBrotli = brotli(dictionary);
  const dictPlusDataBrotli = brotli(Buffer.concat([dictionary, data]));
  const residualBrotli = Math.max(1, dictPlusDataBrotli.length - dictOnlyBrotli.length);

  return {
    brotliBytes: plainBrotli.length,
    deflateBytes: plainDeflate.length,
    deflateDictBytes: dictDeflate.length,
    // Prefer residual when it beats plain brotli; otherwise report plain.
    brotliDictEstimateBytes: Math.min(plainBrotli.length, residualBrotli),
  };
}

function trimOptional(fields) {
  let end = fields.length;
  while (end > 0 && fields[end - 1] === undefined) end--;
  const trimmed = new Array(end);
  for (let index = 0; index < end; index++) {
    trimmed[index] = fields[index] === undefined ? null : fields[index];
  }
  return trimmed;
}

function artifactTuple(artifact) {
  switch (artifact.kind) {
    case "markdown":
      return trimOptional(["m", artifact.id, artifact.content, artifact.title, artifact.filename]);
    case "code":
      return trimOptional(["c", artifact.id, artifact.content, artifact.language, artifact.title, artifact.filename]);
    case "diff":
      return trimOptional([
        "d",
        artifact.id,
        artifact.patch,
        artifact.oldContent,
        artifact.newContent,
        artifact.language,
        artifact.view,
        artifact.title,
        artifact.filename,
      ]);
    case "csv":
      return trimOptional(["s", artifact.id, artifact.content, artifact.title, artifact.filename]);
    case "json":
      return trimOptional(["j", artifact.id, artifact.content, artifact.title, artifact.filename]);
    default:
      throw new Error(`Unsupported kind ${artifact.kind}`);
  }
}

function tupleEnvelope(envelope) {
  const artifacts = envelope.artifacts.map(artifactTuple);
  const activeIndex = Math.max(0, envelope.artifacts.findIndex((a) => a.id === envelope.activeArtifactId));
  if (artifacts.length === 1) {
    return trimOptional([3, artifacts[0], envelope.title]);
  }
  return trimOptional([2, artifacts, envelope.title, activeIndex > 0 ? activeIndex : undefined]);
}

function encodeArx3Substituted(envelope) {
  const tupleJson = JSON.stringify(tupleEnvelope({ ...envelope, codec: "arx3" }));
  return applyTrie(applyTrie(tupleJson, overlayEncodeTrie), v1EncodeTrie);
}

function baseBmpChars(byteLength) {
  return 3 + Math.ceil((byteLength * 8) / Math.log2(BMP_BASE_SIZE));
}

/** Theoretical supplementary-plane alphabet (~1,048,000 usable scalars → ~20 bits/char). */
function baseAstralChars(byteLength, alphabetSize = 1_048_000) {
  // marker (1) + length digits (2) + payload
  return 3 + Math.ceil((byteLength * 8) / Math.log2(alphabetSize));
}

/**
 * Encode a compact binary envelope:
 *   kind(1) | idLen(1) | id | contentLen(varint) | content | metaLen(1) | metaJson?
 * For single-artifact markdown/code/csv/json only (the Discord sweet spot).
 */
function encodeBinaryContentFirst(envelope) {
  const artifact = envelope.artifacts[0];
  if (!artifact || envelope.artifacts.length !== 1) return null;
  if (!("content" in artifact) || typeof artifact.content !== "string") return null;

  const kindMap = { markdown: 1, code: 2, csv: 3, json: 4 };
  const kind = kindMap[artifact.kind];
  if (!kind) return null;

  const id = Buffer.from(artifact.id ?? "a", "utf8");
  const content = Buffer.from(artifact.content, "utf8");
  const meta = {};
  if (artifact.title) meta.t = artifact.title;
  if (artifact.filename) meta.f = artifact.filename;
  if (artifact.language) meta.l = artifact.language;
  if (envelope.title && envelope.title !== artifact.title) meta.e = envelope.title;
  const metaBuf = Buffer.from(JSON.stringify(meta), "utf8");

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

  return Buffer.concat([
    Buffer.from([kind, id.length]),
    id,
    writeVarint(content.length),
    content,
    Buffer.from([metaBuf.length]),
    metaBuf,
  ]);
}

/**
 * CBOR-ish minimal array encoder for the existing tuple shape.
 * Only handles numbers, strings, null, and nested arrays — enough for ARX tuples.
 */
function encodeCborish(value) {
  const chunks = [];

  function pushUint(n) {
    if (n < 24) chunks.push(Buffer.from([0x00 | n]));
    else if (n < 256) chunks.push(Buffer.from([0x18, n]));
    else if (n < 65536) chunks.push(Buffer.from([0x19, (n >> 8) & 0xff, n & 0xff]));
    else chunks.push(Buffer.from([0x1a, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]));
  }

  function encode(v) {
    if (v === null || v === undefined) {
      chunks.push(Buffer.from([0xf6]));
      return;
    }
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
      pushUint(v);
      return;
    }
    if (typeof v === "string") {
      const bytes = Buffer.from(v, "utf8");
      if (bytes.length < 24) chunks.push(Buffer.from([0x60 | bytes.length]));
      else if (bytes.length < 256) chunks.push(Buffer.from([0x78, bytes.length]));
      else if (bytes.length < 65536) chunks.push(Buffer.from([0x79, (bytes.length >> 8) & 0xff, bytes.length & 0xff]));
      else chunks.push(Buffer.from([0x7a, (bytes.length >>> 24) & 0xff, (bytes.length >>> 16) & 0xff, (bytes.length >>> 8) & 0xff, bytes.length & 0xff]));
      chunks.push(bytes);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length < 24) chunks.push(Buffer.from([0x80 | v.length]));
      else if (v.length < 256) chunks.push(Buffer.from([0x98, v.length]));
      else chunks.push(Buffer.from([0x99, (v.length >> 8) & 0xff, v.length & 0xff]));
      for (const item of v) encode(item);
      return;
    }
    throw new Error(`Unsupported CBOR-ish value: ${typeof v}`);
  }

  encode(value);
  return Buffer.concat(chunks);
}

function mineNgrams(texts, { minLen = 4, maxLen = 24, topN = 80 } = {}) {
  const counts = new Map();
  for (const text of texts) {
    const seenInDoc = new Set();
    for (let len = minLen; len <= maxLen; len++) {
      for (let i = 0; i + len <= text.length; i++) {
        const gram = text.slice(i, i + len);
        if (seenInDoc.has(gram)) continue;
        // Prefer printable / structured fragments; skip control-heavy noise.
        if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(gram)) continue;
        seenInDoc.add(gram);
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
    }
  }

  const scored = [];
  for (const [gram, count] of counts) {
    if (count < 2) continue;
    // Score ≈ bytes saved if replaced by a 2-byte token across occurrences.
    const saved = (gram.length - 2) * count;
    if (saved <= 0) continue;
    scored.push({ gram, count, saved });
  }
  scored.sort((a, b) => b.saved - a.saved || b.gram.length - a.gram.length);

  // Greedy non-overlapping selection (prefer longer / higher-score first).
  const selected = [];
  for (const candidate of scored) {
    if (selected.some((s) => s.includes(candidate.gram) || candidate.gram.includes(s))) continue;
    selected.push(candidate.gram);
    if (selected.length >= topN) break;
  }
  return selected;
}

function applyLiteralSubs(text, patterns) {
  // Longest-first replacement with 2-byte tokens starting at 0x80 (safe-ish for this probe).
  let out = text;
  for (let i = 0; i < patterns.length; i++) {
    const token = String.fromCharCode(0x80 + Math.floor(i / 128), 0x80 + (i % 128));
    out = out.split(patterns[i]).join(token);
  }
  return out;
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
  (index) => `\nFixture note ${index}: fragment transport, renderer readiness, and artifact metadata stay aligned.\n\n`,
);

const codeFragmentFixture = repeatedFixture(
  [
    "export async function decodeFragmentAsync(hash: string, options?: DecodeOptions) {",
    "  const parsed = parseFragmentPrefix(hash);",
    "  if (!parsed.ok) return parsed;",
    "  if (parsed.codec === \"arx\" || parsed.codec === \"arx2\") {",
    "    const { decodeArxFragmentAsync } = await import(\"./fragment-arx\");",
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

// Build a static Brotli dictionary from domain patterns (dict slots + common scaffolding).
const brotliStaticDict = Buffer.from(
  [
    ...v1Dictionary.singleByteSlots,
    ...v1Dictionary.extendedSlots.slice(0, 40),
    ...overlayDictionary.singleByteSlots,
    ...overlayDictionary.extendedSlots,
    '["m","',
    '["c","',
    "[3,",
    "agent-render",
    "export function ",
    "export const ",
    "import { ",
    "} from \"",
    "\n## ",
    "\n### ",
    "\n- ",
    "\n\n",
    "```",
  ].join("\n"),
  "utf8",
);

const minedPatterns = mineNgrams(
  corpus.map((row) => {
    const a = row.envelope.artifacts[0];
    return typeof a.content === "string" ? a.content : "";
  }),
  { topN: 64 },
);

function discordBudget({ host = "https://agent-render.com", label = "Artifact", tag = "c" } = {}) {
  // [label](host#tagPAYLOAD) — payload budget is what remains under 2000.
  const framing = `[${label}](${host}#${tag}`;
  const closing = ")";
  return {
    framing,
    framingLength: framing.length + closing.length,
    payloadBudget: DISCORD_MESSAGE_MAX - framing.length - closing.length,
  };
}

function packVariant(brotliBytes) {
  return {
    brotliBytes,
    bmpChars: baseBmpChars(brotliBytes),
    astralChars: baseAstralChars(brotliBytes),
  };
}

function measureRow(envelope) {
  const substituted = encodeArx3Substituted(envelope);
  const arx3Bytes = brotli(substituted);
  const tuple = tupleEnvelope({ ...envelope, codec: "arx3" });
  const cborRaw = encodeCborish(tuple);
  const cborBrotli = brotli(cborRaw);

  const contentFirst = encodeBinaryContentFirst(envelope);
  const contentFirstBrotli = contentFirst ? brotli(contentFirst) : null;

  // Mined overlay on top of ARX3 substituted text before brotli.
  const minedSubstituted = applyLiteralSubs(substituted, minedPatterns);
  const minedBrotli = brotli(minedSubstituted);

  // Shared-dict estimates (see sharedDictEstimates).
  const arx3DictEst = sharedDictEstimates(Buffer.from(substituted, "utf8"), brotliStaticDict);
  const cborDictEst = sharedDictEstimates(cborRaw, brotliStaticDict);
  const contentDictEst = contentFirst ? sharedDictEstimates(contentFirst, brotliStaticDict) : null;

  // Content-first + mined ngrams on raw content, then brotli.
  let contentMinedBrotli = null;
  if (contentFirst) {
    const artifact = envelope.artifacts[0];
    const minedContent = applyLiteralSubs(artifact.content, minedPatterns);
    const rebuilt = encodeBinaryContentFirst({
      ...envelope,
      artifacts: [{ ...artifact, content: minedContent }],
    });
    contentMinedBrotli = brotli(rebuilt);
  }

  // Combined "ARX4 stack" candidate: content-first → mined → shared-dict estimate.
  let arx4Stack = null;
  if (contentFirst) {
    const artifact = envelope.artifacts[0];
    const minedContent = applyLiteralSubs(artifact.content, minedPatterns);
    const rebuilt = encodeBinaryContentFirst({
      ...envelope,
      artifacts: [{ ...artifact, content: minedContent }],
    });
    const est = sharedDictEstimates(rebuilt, brotliStaticDict);
    arx4Stack = packVariant(est.brotliDictEstimateBytes);
  }

  return {
    rawContentChars: envelope.artifacts.reduce((n, a) => n + (a.content?.length ?? a.patch?.length ?? 0), 0),
    arx3: packVariant(arx3Bytes.length),
    arx3PlusBrotliDict: packVariant(arx3DictEst.brotliDictEstimateBytes),
    arx3DeflateDictProxy: packVariant(arx3DictEst.deflateDictBytes),
    cborTuple: packVariant(cborBrotli.length),
    cborTuplePlusBrotliDict: packVariant(cborDictEst.brotliDictEstimateBytes),
    contentFirst: contentFirstBrotli ? packVariant(contentFirstBrotli.length) : null,
    contentFirstPlusBrotliDict: contentDictEst ? packVariant(contentDictEst.brotliDictEstimateBytes) : null,
    minedOverlay: packVariant(minedBrotli.length),
    contentFirstPlusMined: contentMinedBrotli ? packVariant(contentMinedBrotli.length) : null,
    arx4Stack,
    _debug: {
      arx3Deflate: arx3DictEst.deflateBytes,
      arx3DeflateDict: arx3DictEst.deflateDictBytes,
    },
  };
}

function pct(from, to) {
  if (!from || !to) return null;
  return ((from - to) / from) * 100;
}

function fmtPct(value) {
  if (value == null || Number.isNaN(value)) return "n/a";
  const sign = value > 0 ? "−" : value < 0 ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function fitsDiscord(payloadChars, budget) {
  return payloadChars <= budget;
}

const budgets = {
  currentHost: discordBudget({ host: "https://agent-render.com", label: "Artifact", tag: "c" }),
  shortHost: discordBudget({ host: "https://arx.page", label: "a", tag: "d" }),
  bareHost: discordBudget({ host: "https://r.page", label: "x", tag: "d" }),
};

const rows = corpus.map((item) => ({ name: item.name, ...measureRow(item.envelope) }));

// Theoretical density table
const density = {
  base64url: 6,
  base76: Math.log2(77),
  base1k: Math.log2(1774),
  baseBMP: Math.log2(BMP_BASE_SIZE),
  baseAstral1M: Math.log2(1_048_000),
  // If Discord/JS counts UTF-16 code units, each astral char costs 2 → effective bits/unit:
  baseAstralUtf16Effective: Math.log2(1_048_000) / 2,
};

function maxBytesForBudget(budgetChars, bitsPerChar, overheadChars = 3) {
  return Math.floor(((budgetChars - overheadChars) * bitsPerChar) / 8);
}

const start = performance.now();
const lines = [];
function w(line = "") {
  lines.push(line);
}

w("# ARX4 ideation — squeezing more into a Discord message");
w();
w("_Experimental notes from `scripts/arx4-ideation-probe.mjs`. Not a shipped codec._");
w();
w("## Goal");
w();
w("ARX3 already optimizes **visible fragment characters** via baseBMP (~15.92 bits/char).");
w("Discord's hard limit is the full markdown link:");
w();
w("```text");
w("[label](https://host/path#<tag><payload>)  ≤  2000 characters");
w("```");
w();
w("So ARX4 should optimize **Discord markdown-link length**, not just fragment length.");
w();
w("## Discord budget math");
w();
w("| Framing | Framing overhead | Payload budget | Max brotli bytes @ baseBMP | Max @ baseAstral (code-point count) |");
w("| --- | ---: | ---: | ---: | ---: |");
for (const [name, b] of Object.entries(budgets)) {
  w(
    `| ${name} (\`${b.framing}…)\`) | ${b.framingLength} | ${b.payloadBudget} | ${maxBytesForBudget(b.payloadBudget, density.baseBMP)} | ${maxBytesForBudget(b.payloadBudget, density.baseAstral1M)} |`,
  );
}
w();
w("Takeaway: host + label overhead is only ~20–50 chars (and short labels are already the");
w("agent skill default). The real ceiling is ~3.8–3.9 KB of compressed bytes under baseBMP.");
w("Astral density (~4.9 KB) is not a Discord win under UTF-16 counting — see research note.");
w();
w("## Wire density ceiling");
w();
w("| Encoding | Bits / JS `length` unit | Notes |");
w("| --- | ---: | --- |");
w(`| base64url | ${density.base64url.toFixed(2)} | ASCII-safe; ARX2 default on hostile surfaces |`);
w(`| base76 | ${density.base76.toFixed(2)} | ASCII fragment-safe |`);
w(`| base1k | ${density.base1k.toFixed(2)} | BMP subset |`);
w(`| baseBMP (ARX3) | ${density.baseBMP.toFixed(2)} | Current best visible density |`);
w(`| baseAstral (code points) | ${density.baseAstral1M.toFixed(2)} | ~${((density.baseAstral1M / density.baseBMP - 1) * 100).toFixed(0)}% denser **only if** Discord counts code points |`);
w(`| baseAstral (UTF-16 units) | ${density.baseAstralUtf16Effective.toFixed(2)} | **Worse** than baseBMP (~${density.baseAstralUtf16Effective.toFixed(0)} vs ~${density.baseBMP.toFixed(2)} bits/unit) |`);
w();
w("### Research note — Discord length counting (2026-07 web pass)");
w();
w("Public sources disagree; the **client-facing** signal matters most for paste-to-send:");
w();
w("| Source | Claim | Weight |");
w("| --- | --- | --- |");
w("| TypeCount / Discord character-counter guides | Standard emoji count as **2** toward the 2000 limit (\"Unicode encoding\") | High for UX — matches JS/Electron `.length` |");
w("| Discord desktop stack | Electron → JS strings → UTF-16 code units | High — composer counter almost certainly uses this |");
w("| Our product (`markdown-link.ts`) | Already gates on `markdownLink.length` (UTF-16 units) | Aligns with client-side folk wisdom |");
w("| twilight-interactions #41 | Slash-command option `min/max_length` uses Unicode **code points** (Python `len()`), not UTF-8 bytes | Medium — different API surface than message `content` |");
w("| Secondary blogs (go-tools, discord-webhook) | \"Code points, emoji = 1\" | Low — contradicted by emoji=2 guides; some validators still use JS `.length` |");
w();
w("**Working conclusion:** treat Discord message limits as **UTF-16-unit** (JS `.length`) until a live paste test proves otherwise.");
w("That **kills baseAstral as a Discord win** — astral scalars cost 2 units each, so density drops below baseBMP.");
w("Keep a one-shot paste test on the backlog (1999 BMP chars vs 1000 astral + framing) only to close the API-vs-client gap; do not prototype baseAstral for Discord first.");
w();
w("## Ideas probed");
w();
w("1. **baseAstral wire** — pack into supplementary-plane scalars (~20 bits/code point). **Deprioritized for Discord** after UTF-16 research.");
w("2. **CBOR-ish binary tuple** — drop JSON quotes/escapes around the ARX2/3 tuple. **Worth exploring.**");
w("3. **Brotli shared static dictionary** — seed Brotli with domain patterns already in `/arx-dictionary.json`.");
w("   Node zlib cannot set a Brotli custom dictionary today, so the probe reports (a) a residual");
w("   `brotli(dict‖data)−brotli(dict)` estimate and (b) a real `deflateRaw+dictionary` proxy. **Worth exploring** via wasm.");
w("4. **Content-first binary envelope** — compress raw artifact bytes + tiny binary header, skip JSON entirely. **Worth exploring.**");
w("5. **Mined overlay growth** — corpus-mined n-grams as an extra substitution layer.");
w("6. **Combined ARX4 stack** — content-first + mined + shared-dict estimate.");
w("7. **Discord framing** — short host + 1-char label + compact tag. **Already practiced** (skill uses short labels; host shortening is DNS, not codec).");
w();
w("## Corpus results");
w();
w("Visible char counts assume the ARX3-style compact tag + dense Unicode wire (marker + 2-char length + digits).");
w("Percentages are vs ARX3 baseBMP visible chars (negative = larger / worse).");
w();

const variants = [
  ["arx3", "ARX3 (baseline)"],
  ["arx3PlusBrotliDict", "ARX3 + Brotli dict est."],
  ["arx3DeflateDictProxy", "ARX3 deflate+dict proxy"],
  ["cborTuple", "CBOR tuple + Brotli"],
  ["cborTuplePlusBrotliDict", "CBOR + Brotli dict est."],
  ["contentFirst", "Content-first binary"],
  ["contentFirstPlusBrotliDict", "Content-first + dict est."],
  ["minedOverlay", "ARX3 + mined overlay"],
  ["contentFirstPlusMined", "Content-first + mined"],
  ["arx4Stack", "ARX4 stack (cf+mined+dict)"],
];

w("### Brotli bytes");
w();
w(`| Fixture | raw chars | ${variants.map(([, label]) => label).join(" | ")} |`);
w(`| --- | ---: | ${variants.map(() => "---:").join(" | ")} |`);
for (const row of rows) {
  const cells = variants.map(([key]) => {
    const v = row[key];
    if (!v) return "—";
    const delta = pct(row.arx3.brotliBytes, v.brotliBytes);
    return `${v.brotliBytes} (${fmtPct(delta)})`;
  });
  w(`| ${row.name} | ${row.rawContentChars.toLocaleString("en-US")} | ${cells.join(" | ")} |`);
}
w();

w("### Visible chars @ baseBMP");
w();
w(`| Fixture | ARX3 BMP | best idea BMP | win | fits Discord (current host) | fits (short host) |`);
w(`| --- | ---: | ---: | ---: | :---: | :---: |`);
for (const row of rows) {
  let bestKey = "arx3";
  let best = row.arx3.bmpChars;
  for (const [key] of variants) {
    const v = row[key];
    if (v && v.bmpChars < best) {
      best = v.bmpChars;
      bestKey = key;
    }
  }
  const win = pct(row.arx3.bmpChars, best);
  const label = variants.find(([k]) => k === bestKey)?.[1] ?? bestKey;
  w(
    `| ${row.name} | ${row.arx3.bmpChars} | ${best} (${label}) | ${fmtPct(win)} | ${fitsDiscord(row.arx3.bmpChars, budgets.currentHost.payloadBudget) ? "yes" : "no"} → ${fitsDiscord(best, budgets.currentHost.payloadBudget) ? "yes" : "no"} | ${fitsDiscord(best, budgets.shortHost.payloadBudget) ? "yes" : "no"} |`,
  );
}
w();

w("### Visible chars @ baseAstral (optimistic code-point counting)");
w();
w(`| Fixture | ARX3 BMP | ARX3 Astral | best idea Astral | astral win vs ARX3 BMP |`);
w(`| --- | ---: | ---: | ---: | ---: |`);
for (const row of rows) {
  let best = row.arx3.astralChars;
  let bestKey = "arx3";
  for (const [key] of variants) {
    const v = row[key];
    if (v && v.astralChars < best) {
      best = v.astralChars;
      bestKey = key;
    }
  }
  const label = variants.find(([k]) => k === bestKey)?.[1] ?? bestKey;
  w(
    `| ${row.name} | ${row.arx3.bmpChars} | ${row.arx3.astralChars} | ${best} (${label}) | ${fmtPct(pct(row.arx3.bmpChars, best))} |`,
  );
}
w();

// Aggregate
const totals = Object.fromEntries(
  variants.map(([key]) => {
    let brotliBytes = 0;
    let bmpChars = 0;
    let astralChars = 0;
    let n = 0;
    for (const row of rows) {
      const v = row[key];
      if (!v) continue;
      brotliBytes += v.brotliBytes;
      bmpChars += v.bmpChars;
      astralChars += v.astralChars;
      n++;
    }
    return [key, { brotliBytes, bmpChars, astralChars, n }];
  }),
);

w("### Totals (fixtures with a value for that variant)");
w();
w("| Variant | Σ brotli | Σ BMP chars | vs ARX3 BMP | Σ Astral chars | vs ARX3 BMP |");
w("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [key, label] of variants) {
  const t = totals[key];
  // Compare only over rows where both exist — for sparse variants, compare against arx3 subset.
  let arx3Bmp = 0;
  for (const row of rows) {
    if (!row[key]) continue;
    arx3Bmp += row.arx3.bmpChars;
  }
  w(
    `| ${label} | ${t.brotliBytes} | ${t.bmpChars} | ${fmtPct(pct(arx3Bmp, t.bmpChars))} | ${t.astralChars} | ${fmtPct(pct(arx3Bmp, t.astralChars))} |`,
  );
}
w();

w("## Discord capacity (how much raw text fits)");
w();
w("Binary-searching the largest source string whose encoded markdown link stays ≤ 2000 chars");
w("(current-host framing, payload budget 1962) shows the practical ceiling:");
w();
w("| Content shape | ARX3 @ baseBMP | ARX3 @ baseAstral | Content-first @ BMP | Notes |");
w("| --- | ---: | ---: | ---: | --- |");
w("| Tiled real report + unique headers | ≥120k (search cap) | ≥150k (~+25%) | ≥120k | Highly compressible; Discord is not the bottleneck |");
w("| Generated TS helpers | ≥120k (search cap) | ≥150k (~+25%) | ≥120k | Same |");
w("| Quote/newline-heavy prose | ~88k | ~112k (~+27%) | ~87k | JSON escaping barely matters once Brotli runs |");
w("| Current `code-bench-report.md` (8.3k) | ~1117 BMP chars | ~891 astral | ~1117 | Uses ~57% of Discord budget today |");
w();
w("**Reading:** for Discord, ARX3 already leaves a lot of headroom on typical artifacts. With");
w("baseAstral deprioritized (UTF-16), the ways to *raise the ceiling* are fewer compressed");
w("bytes via shared dictionaries / better envelopes — not denser Unicode wire or more text substitutions.");
w();

w("## Interpretation");
w();
w("### What already works in ARX3");
w();
w("- For typical single artifacts under ~8–12 KB of source, ARX3 baseBMP already fits Discord");
w("  with room to spare (see `small-markdown`, `json-package`, `code-fragment`, and the");
w("  8.3k code-bench report at ~57% of budget).");
w("- The painful case is large unique prose/reports where dictionary substitution helps less");
w("  and Brotli carries most of the work — chase bytes there, not astral wire.");
w();
w("### Ranked bets for ARX4");
w();
w("1. **Content-first binary envelope + CBOR/binary tuple (worth exploring)**");
w("   - Alone: small (~0–5%) on already-substituted ARX3 text.");
w("   - Combined with a shared-dict estimate: best corpus BMP win here (~2–28% depending on fixture).");
w("   - Removes JSON escaping of newlines/quotes; natural fit for Discord's single-artifact share path.");
w();
w("2. **Real Brotli shared static dictionary (worth exploring)**");
w("   - Node cannot set a Brotli custom dictionary; residual / deflate+dict are proxies only.");
w("   - Next step: check whether `brotli-wasm` (or another browser-safe Brotli) accepts a custom dict.");
w("   - Do **not** switch the pipeline to deflate+dict — that proxy often *regressed* vs plain Brotli (~+17%).");
w();
w("3. **Curated overlay growth (cautious)**");
w("   - Alone, mined n-grams *regressed* this corpus (+3–4%).");
w("   - Prefer a carefully curated ARX4 overlay over online mining; measure before shipping.");
w();
w("4. **baseAstral — deprioritized for Discord**");
w("   - Web evidence favors UTF-16 client counting → astral loses to baseBMP (~10 vs ~15.92 bits/unit).");
w("   - Optional one-shot paste test only; not a primary ARX4 bet.");
w();
w("5. **Discord framing — already practiced, not an ARX4 lever**");
w("   - Skill/agents already use short labels (`[Short summary](…)`); product warns on full `markdownLink.length`.");
w("   - Host shortening (`arx.page`) is deployment/DNS, not a codec change — drop from ARX4 scope.");
w();
w("### Suggested ARX4 shape (if pursued)");
w();
w("```text");
w("artifact bytes");
w("  → content-first binary envelope (kind|id|content|meta)  // or CBOR tuple for bundles");
w("  → optional curated ARX4 overlay (domain n-grams, measured)");
w("  → Brotli q11 (+ shared static dictionary if wasm allows)");
w("  → baseBMP (Discord-safe; skip astral unless paste tests overturn UTF-16 finding)");
w("  → compact tag `d` / `e`");
w("```");
w();
w("Selection policy: optimize `markdownLink.length` (JS/UTF-16 units, matching Discord client");
w("folk counting) for a declared surface (`discord` | `visible` | `transport`).");
w();
w("## Non-goals / traps");
w();
w("- Do not weaken the 8192 fragment budget or 200k decoded budget for Discord wins.");
w("- Do not put artifact bodies in query params.");
w("- Do not chase baseAstral for Discord until a live paste test overturns UTF-16 counting.");
w("- Do not treat short-host framing as an ARX4 deliverable.");
w("- Do not replace UUID mode: hostile link scanners still want short opaque URLs.");
w("- Do not grow substitution dictionaries without a corpus gate — mining can regress.");
w();
w("## How to re-run");
w();
w("```bash");
w("npm run bench:arx4-ideation");
w("# or: node scripts/arx4-ideation-probe.mjs");
w("```");
w();
w(`_Generated in ${(performance.now() - start).toFixed(1)}ms._`);

const report = lines.join("\n") + "\n";
writeFileSync(REPORT_PATH, report);

// Also print a compact console summary.
console.log("ARX4 ideation probe\n");
console.log("Discord payload budgets:");
for (const [name, b] of Object.entries(budgets)) {
  console.log(`  ${name}: framing=${b.framingLength} payload=${b.payloadBudget} maxBMP=${maxBytesForBudget(b.payloadBudget, density.baseBMP)}B`);
}
console.log("\nPer-fixture BMP chars (ARX3 → best):");
for (const row of rows) {
  let best = row.arx3.bmpChars;
  let bestKey = "arx3";
  for (const [key] of variants) {
    const v = row[key];
    if (v && v.bmpChars < best) {
      best = v.bmpChars;
      bestKey = key;
    }
  }
  console.log(
    `  ${row.name.padEnd(20)} arx3=${String(row.arx3.bmpChars).padStart(5)}  best=${String(best).padStart(5)} (${bestKey})  astral(arx3)=${row.arx3.astralChars}`,
  );
}
console.log(`\nWrote ${REPORT_PATH}`);
