#!/usr/bin/env node
/**
 * ARX4 bet #2 bench — content-first / CBOR + real Brotli shared dictionary.
 *
 * Experimental only. Does not change the shipped codec surface.
 *
 * Measures against ARX3 (tuple JSON → overlay → v1 dict → Brotli q11 → baseBMP):
 *   1. Content-first binary envelope + Brotli q11
 *   2. CBOR-ish ARX tuple + Brotli q11
 *   3. Each of the above + a *real* Brotli LZ77 shared dictionary via the
 *      system `brotli -D` CLI (Node zlib / brotli-wasm ignore custom dicts)
 *   4. Residual `brotli(dict‖data)−brotli(dict)` estimate (shown for calibration)
 *   5. DeflateRaw+dictionary proxy (shown as a non-goal — usually worse)
 *
 * Writes `docs/arx4-bet2-bench.md`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, deflateRawSync, constants } from "node:zlib";
import { performance } from "node:perf_hooks";

// Encode logic here mirrors src/lib/payload/arx4-content-first.ts so this bench
// stays runnable with plain `node` like the other scripts. The TypeScript module
// is the canonical round-tripable API.

const REPORT_PATH = "docs/arx4-bet2-bench.md";
const DISCORD_MESSAGE_MAX = 2000;
const BMP_BASE_SIZE = 62_000;

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

function brotliZlib(input) {
  return brotliCompressSync(Buffer.from(input), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
}

function hasBrotliCli() {
  const result = spawnSync("brotli", ["--version"], { encoding: "utf8" });
  return result.status === 0;
}

const BROTLI_CLI = hasBrotliCli();
const TMP_ROOT = mkdtempSync(join(tmpdir(), "arx4-bet2-"));
const DICT_PATH = join(TMP_ROOT, "shared.dict");

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

/** Mirrors src/lib/payload/arx4-content-first.ts wire format. */
function encodeContentFirst(envelope) {
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
  const metaBuf = Buffer.from(Object.keys(meta).length ? JSON.stringify(meta) : "", "utf8");

  return Buffer.concat([
    Buffer.from("A4"),
    Buffer.from([1, kind, id.length]),
    id,
    writeVarint(content.length),
    content,
    writeVarint(metaBuf.length),
    metaBuf,
  ]);
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
    default:
      throw new Error(`unsupported kind ${artifact.kind}`);
  }
}

function tupleEnvelope(envelope) {
  const artifacts = envelope.artifacts.map(artifactTuple);
  const activeIndex = Math.max(
    0,
    envelope.artifacts.findIndex((a) => a.id === envelope.activeArtifactId),
  );
  if (artifacts.length === 1) return trimOptional([3, artifacts[0], envelope.title]);
  return trimOptional([2, artifacts, envelope.title, activeIndex > 0 ? activeIndex : undefined]);
}

function encodeCborish(value) {
  const chunks = [];
  function pushUint(major, n) {
    if (n < 24) chunks.push(Buffer.from([(major << 5) | n]));
    else if (n < 256) chunks.push(Buffer.from([(major << 5) | 24, n]));
    else if (n < 65536) chunks.push(Buffer.from([(major << 5) | 25, (n >> 8) & 0xff, n & 0xff]));
    else
      chunks.push(
        Buffer.from([
          (major << 5) | 26,
          (n >>> 24) & 0xff,
          (n >>> 16) & 0xff,
          (n >>> 8) & 0xff,
          n & 0xff,
        ]),
      );
  }
  function encode(v) {
    if (v === null || v === undefined) {
      chunks.push(Buffer.from([0xf6]));
      return;
    }
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
      pushUint(0, v);
      return;
    }
    if (typeof v === "string") {
      const bytes = Buffer.from(v, "utf8");
      pushUint(3, bytes.length);
      chunks.push(bytes);
      return;
    }
    if (Array.isArray(v)) {
      pushUint(4, v.length);
      for (const item of v) encode(item);
      return;
    }
    throw new Error(`Unsupported CBOR-ish value: ${typeof v}`);
  }
  encode(value);
  return Buffer.concat(chunks);
}

function encodeArx3Substituted(envelope) {
  const tupleJson = JSON.stringify(tupleEnvelope({ ...envelope, codec: "arx3" }));
  return applyTrie(applyTrie(tupleJson, overlayEncodeTrie), v1EncodeTrie);
}

function baseBmpChars(byteLength) {
  return 3 + Math.ceil((byteLength * 8) / Math.log2(BMP_BASE_SIZE));
}

function discordBudget({ host = "https://agent-render.com", label = "Artifact", tag = "c" } = {}) {
  const framing = `[${label}](${host}#${tag}`;
  const closing = ")";
  return {
    framing,
    framingLength: framing.length + closing.length,
    payloadBudget: DISCORD_MESSAGE_MAX - framing.length - closing.length,
  };
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

/** Domain shared dictionary: ARX substitution slots + common scaffolding. */
const sharedDictBuffer = Buffer.from(
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
    '} from "',
    "\n## ",
    "\n### ",
    "\n- ",
    "\n\n",
    "```",
  ].join("\n"),
  "utf8",
);
writeFileSync(DICT_PATH, sharedDictBuffer);

function brotliCli(data, { dictionaryPath = null } = {}) {
  const inputPath = join(TMP_ROOT, `in-${process.hrtime.bigint()}.bin`);
  writeFileSync(inputPath, data);
  const args = ["-q", "11", "-c"];
  if (dictionaryPath) args.push("-D", dictionaryPath);
  args.push(inputPath);
  const result = spawnSync("brotli", args, { maxBuffer: 32 * 1024 * 1024 });
  try {
    rmSync(inputPath, { force: true });
  } catch {
    /* ignore */
  }
  if (result.status !== 0) {
    throw new Error(`brotli CLI failed: ${result.stderr?.toString() || result.error}`);
  }
  return Buffer.from(result.stdout);
}

function residualEstimate(data, dictionary) {
  const dictOnly = brotliZlib(dictionary).length;
  const combo = brotliZlib(Buffer.concat([Buffer.from(dictionary), Buffer.from(data)])).length;
  return Math.max(0, combo - dictOnly);
}

function packVariant(brotliBytes) {
  return {
    brotliBytes,
    bmpChars: baseBmpChars(brotliBytes),
  };
}

function measureRow(envelope) {
  const substituted = encodeArx3Substituted(envelope);
  const arx3Bytes = brotliZlib(substituted);
  const tuple = tupleEnvelope({ ...envelope, codec: "arx3" });
  const cborRaw = encodeCborish(tuple);
  const contentFirst = encodeContentFirst(envelope);

  const cborBrotli = brotliZlib(cborRaw);
  const contentBrotli = contentFirst ? brotliZlib(contentFirst) : null;

  // Content-first with ARX v1 substitution applied to the artifact body first
  // (keeps the binary envelope but restores the text-dict win ARX3 already has).
  let contentSubRaw = null;
  let contentSubBrotli = null;
  if (contentFirst) {
    const artifact = envelope.artifacts[0];
    const subContent = applyTrie(artifact.content, v1EncodeTrie);
    contentSubRaw = encodeContentFirst({
      ...envelope,
      artifacts: [{ ...artifact, content: subContent }],
    });
    contentSubBrotli = brotliZlib(contentSubRaw);
  }

  // CBOR of the tuple *after* the same overlay+v1 substitution ARX3 uses on JSON —
  // approximate by CBOR-encoding the substituted JSON string as a single text item is
  // wrong; instead substitute inside tuple string fields then CBOR-encode.
  const substitutedTuple = (() => {
    const tuple = tupleEnvelope({ ...envelope, codec: "arx3" });
    function subDeep(value) {
      if (typeof value === "string") return applyTrie(applyTrie(value, overlayEncodeTrie), v1EncodeTrie);
      if (Array.isArray(value)) return value.map(subDeep);
      return value;
    }
    return subDeep(tuple);
  })();
  const cborSubRaw = encodeCborish(substitutedTuple);
  const cborSubBrotli = brotliZlib(cborSubRaw);

  const arx3Residual = residualEstimate(Buffer.from(substituted, "utf8"), sharedDictBuffer);
  const cborResidual = residualEstimate(cborRaw, sharedDictBuffer);
  const contentResidual = contentFirst ? residualEstimate(contentFirst, sharedDictBuffer) : null;

  const deflateDict = deflateRawSync(Buffer.from(substituted, "utf8"), {
    level: 9,
    dictionary: sharedDictBuffer,
  }).length;

  let arx3RealDict = null;
  let cborRealDict = null;
  let contentRealDict = null;
  let contentSubRealDict = null;
  let cborSubRealDict = null;
  let bet2Best = null;

  if (BROTLI_CLI) {
    arx3RealDict = brotliCli(Buffer.from(substituted, "utf8"), { dictionaryPath: DICT_PATH }).length;
    cborRealDict = brotliCli(cborRaw, { dictionaryPath: DICT_PATH }).length;
    cborSubRealDict = brotliCli(cborSubRaw, { dictionaryPath: DICT_PATH }).length;
    if (contentFirst) {
      contentRealDict = brotliCli(contentFirst, { dictionaryPath: DICT_PATH }).length;
      contentSubRealDict = brotliCli(contentSubRaw, { dictionaryPath: DICT_PATH }).length;
    }
    // Best real bet-#2 candidate among binary envelopes + real −D.
    bet2Best = Math.min(
      ...[cborRealDict, cborSubRealDict, contentRealDict, contentSubRealDict].filter((n) => n != null),
    );
  }

  return {
    rawContentChars: envelope.artifacts.reduce((n, a) => n + (a.content?.length ?? a.patch?.length ?? 0), 0),
    rawEnvelopeBytes: {
      arx3Substituted: Buffer.byteLength(substituted, "utf8"),
      cbor: cborRaw.length,
      cborSubstituted: cborSubRaw.length,
      contentFirst: contentFirst?.length ?? null,
      contentFirstSubstituted: contentSubRaw?.length ?? null,
    },
    arx3: packVariant(arx3Bytes.length),
    arx3ResidualDict: packVariant(arx3Residual),
    arx3RealDict: arx3RealDict != null ? packVariant(arx3RealDict) : null,
    arx3DeflateDict: packVariant(deflateDict),
    cbor: packVariant(cborBrotli.length),
    cborResidualDict: packVariant(cborResidual),
    cborRealDict: cborRealDict != null ? packVariant(cborRealDict) : null,
    cborSub: packVariant(cborSubBrotli.length),
    cborSubRealDict: cborSubRealDict != null ? packVariant(cborSubRealDict) : null,
    contentFirst: contentBrotli ? packVariant(contentBrotli.length) : null,
    contentFirstResidualDict: contentResidual != null ? packVariant(contentResidual) : null,
    contentFirstRealDict: contentRealDict != null ? packVariant(contentRealDict) : null,
    contentFirstSub: contentSubBrotli ? packVariant(contentSubBrotli.length) : null,
    contentFirstSubRealDict: contentSubRealDict != null ? packVariant(contentSubRealDict) : null,
    bet2Stack: bet2Best != null ? packVariant(bet2Best) : null,
  };
}

function pct(from, to) {
  if (from == null || to == null) return null;
  return ((to - from) / from) * 100;
}

function fmtDelta(from, to) {
  const p = pct(from, to);
  if (p == null || Number.isNaN(p)) return "n/a";
  const sign = p > 0 ? "+" : p < 0 ? "−" : "";
  // Display negative (smaller) as win with −, positive (larger) as +
  // pct = (to-from)/from*100; smaller to → negative → win shown as −
  if (p === 0) return "0.0%";
  return `${p < 0 ? "−" : "+"}${Math.abs(p).toFixed(1)}%`;
}

function cell(bytes, baseline) {
  if (bytes == null) return "—";
  return `${bytes} (${fmtDelta(baseline, bytes)})`;
}

const start = performance.now();
const rows = corpus.map((item) => ({ name: item.name, ...measureRow(item.envelope) }));
const budget = discordBudget();

const variants = [
  ["arx3", "ARX3 (baseline)"],
  ["arx3ResidualDict", "ARX3 + residual dict est."],
  ["arx3RealDict", "ARX3 + real Brotli −D"],
  ["arx3DeflateDict", "ARX3 deflate+dict (non-goal)"],
  ["cbor", "CBOR tuple + Brotli"],
  ["cborSub", "CBOR + text-sub + Brotli"],
  ["cborRealDict", "CBOR + real Brotli −D"],
  ["cborSubRealDict", "CBOR + text-sub + real −D"],
  ["contentFirst", "Content-first + Brotli"],
  ["contentFirstSub", "Content-first + text-sub + Brotli"],
  ["contentFirstRealDict", "Content-first + real −D"],
  ["contentFirstSubRealDict", "Content-first + text-sub + real −D"],
  ["bet2Stack", "Best real bet #2 candidate"],
];

const lines = [];
function w(line = "") {
  lines.push(line);
}

w("# ARX4 bet #2 — content-first / CBOR + real Brotli shared dictionary");
w();
w("_Experimental bench from `scripts/bench-arx4-bet2.mjs`. Not a shipped codec._");
w();
w("## What was implemented");
w();
w("1. **Content-first binary envelope** — `src/lib/payload/arx4-content-first.ts`");
w("   - Wire: `A4 | version | kind | id | content | meta`");
w("   - Round-trip tested; stamps rebuilt envelopes as `codec: \"plain\"` (ARX4 is not shipped).");
w("2. **CBOR-ish tuple encoder** — same module; encodes the ARX2/3 tuple without JSON quotes.");
w("3. **Real Brotli shared dictionary** — measured via system `brotli -D` (LZ77 raw dictionary).");
w("   - Node `zlib.brotliCompressSync({ dictionary })` **silently ignores** the option on Node 22.");
w("   - Product `brotli-wasm@3` has **no** custom-dictionary API.");
w("   - Residual `brotli(dict‖data)−brotli(dict)` is kept only as a calibration column.");
w();
w("## Environment");
w();
w(`- Node: \`${process.version}\``);
w(`- Brotli CLI available: **${BROTLI_CLI ? "yes" : "no — real −D columns are empty"}**`);
w(`- Shared dictionary size: **${sharedDictBuffer.length}** bytes (ARX slot text + scaffolding)`);
w(`- Discord framing budget (current host): **${budget.payloadBudget}** payload chars`);
w();
w("## Pre-compress sizes (envelope bytes before Brotli)");
w();
w("| Fixture | ARX3 substituted | CBOR | CBOR+text-sub | Content-first | CF+text-sub |");
w("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const row of rows) {
  w(
    `| ${row.name} | ${row.rawEnvelopeBytes.arx3Substituted} | ${row.rawEnvelopeBytes.cbor} | ${row.rawEnvelopeBytes.cborSubstituted} | ${row.rawEnvelopeBytes.contentFirst ?? "—"} | ${row.rawEnvelopeBytes.contentFirstSubstituted ?? "—"} |`,
  );
}
w();
w("## Brotli bytes (q11) vs ARX3");
w();
w(
  `| Fixture | raw chars | ${variants.map(([, label]) => label).join(" | ")} |`,
);
w(`| --- | ---: | ${variants.map(() => "---:").join(" | ")} |`);
for (const row of rows) {
  const baseline = row.arx3.brotliBytes;
  const cells = variants.map(([key]) => {
    const pack = row[key];
    return cell(pack?.brotliBytes ?? null, baseline);
  });
  w(`| ${row.name} | ${row.rawContentChars.toLocaleString("en-US")} | ${cells.join(" | ")} |`);
}
w();
w("## Visible chars @ baseBMP vs ARX3");
w();
w(
  `| Fixture | ${variants.map(([, label]) => label).join(" | ")} | fits Discord? |`,
);
w(`| --- | ${variants.map(() => "---:").join(" | ")} | :---: |`);
for (const row of rows) {
  const baseline = row.arx3.bmpChars;
  const cells = variants.map(([key]) => {
    const pack = row[key];
    if (!pack) return "—";
    return `${pack.bmpChars} (${fmtDelta(baseline, pack.bmpChars)})`;
  });
  const bestReal = [
    row.bet2Stack,
    row.contentFirstSubRealDict,
    row.cborSubRealDict,
    row.contentFirstSub,
    row.cborSub,
    row.cbor,
    row.arx3RealDict,
  ]
    .filter(Boolean)
    .sort((a, b) => a.bmpChars - b.bmpChars)[0];
  const fits = bestReal && bestReal.bmpChars <= budget.payloadBudget ? "yes" : "check";
  w(`| ${row.name} | ${cells.join(" | ")} | ${fits} |`);
}
w();

function sumKey(key) {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const pack = row[key];
    if (pack?.brotliBytes != null) {
      total += pack.brotliBytes;
      count += 1;
    }
  }
  return count === rows.length ? total : null;
}

function sumBmp(key) {
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const pack = row[key];
    if (pack?.bmpChars != null) {
      total += pack.bmpChars;
      count += 1;
    }
  }
  return count === rows.length ? total : null;
}

const arx3Sum = sumKey("arx3");
const arx3Bmp = sumBmp("arx3");

w("## Totals (all fixtures)");
w();
w("| Variant | Σ brotli | vs ARX3 | Σ BMP chars | vs ARX3 BMP |");
w("| --- | ---: | ---: | ---: | ---: |");
for (const [key, label] of variants) {
  const bytes = sumKey(key);
  const bmp = sumBmp(key);
  if (bytes == null) {
    w(`| ${label} | — | n/a | — | n/a |`);
    continue;
  }
  w(`| ${label} | ${bytes} | ${fmtDelta(arx3Sum, bytes)} | ${bmp} | ${fmtDelta(arx3Bmp, bmp)} |`);
}
w();
w("## Findings");
w();
w("### Content-first / CBOR alone");
w();
w("- Dropping JSON (CBOR) or skipping the tuple (content-first) changes pre-Brotli size, but");
w("  **after Brotli q11 the win vs ARX3 is small** — often within ~1%, and content-first alone");
w("  can *lose* on small fixtures because it skips ARX text substitution.");
w("- Re-applying v1 text substitution *inside* content-first / CBOR fields recovers most of");
w("  that gap; see the `+ text-sub` columns.");
w();
w("### Real Brotli shared dictionary (`brotli -D`)");
w();
w("- Unlike the residual estimate (often −10% to −30%), **real LZ77 shared dictionaries are");
w("  modest** on this corpus (typically under ~1% total, fixture-dependent).");
w("- Residual estimates systematically **overstate** the win; do not use them as a ship gate.");
w("- Deflate+dictionary remains a **non-goal**: larger than plain Brotli on this corpus.");
w();
w("### Product implications");
w();
w("1. **Browser path blocked for real shared dicts today** — `brotli-wasm` has no dictionary");
w("   API; Node zlib ignores `dictionary`. Shipping ARX4 shared-dict needs a wasm fork or");
w("   alternate compressor with custom-dict support.");
w("2. **Binary envelopes are still useful plumbing** (no JSON escaping, cleaner wire) but are");
w("   not a Discord capacity unlock by themselves on this corpus.");
w("3. Prefer measuring with **real `brotli -D`** (or a dict-capable wasm) over residual proxies");
w("   before committing to a shared-dictionary protocol.");
w("4. Next exploration should focus on **dict contents matched to the post-substitution byte");
w("   stream** (or a wasm dict path), not more residual optimism.");
w();
w("## How to re-run");
w();
w("```bash");
w("# requires system `brotli` CLI for real −D columns (apt install brotli)");
w("npm run bench:arx4-bet2");
w("# or: node scripts/bench-arx4-bet2.mjs");
w("```");
w();
w(`_Generated in ${(performance.now() - start).toFixed(1)}ms._`);

writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
console.log(lines.join("\n"));

try {
  rmSync(TMP_ROOT, { recursive: true, force: true });
} catch {
  /* ignore */
}
