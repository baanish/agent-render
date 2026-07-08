#!/usr/bin/env node
/**
 * ARX4 kind-specific dictionary probe.
 *
 * Question: is a per-kind substitution dict worth it — and do we need to spend
 * an extra fragment char to select it?
 *
 * Tag-cost options:
 *   free tags  — unused compact tags (m/k/j/s/f) select kind dict → +0 chars
 *   +1 selector — keep `c` and add one BMP digit / ASCII selector → +1 char
 *   infer kind — kind already in envelope; decoder peeks then picks dict → +0
 *                (harder: substitution runs *before* JSON parse today)
 *
 * Experimental only. Writes `docs/arx4-kind-dicts.md`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { performance } from "node:perf_hooks";

const REPORT_PATH = "docs/arx4-kind-dicts.md";
const BMP_BASE_SIZE = 62_000;
const DISCORD_MESSAGE_MAX = 2000;

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

function buildTrie(pairs) {
  const root = { children: new Map() };
  for (const [from, to] of pairs) {
    let node = root;
    for (const char of from) {
      let child = node.children.get(char);
      if (!child) {
        child = { children: new Map() };
        node.children.set(char, child);
      }
      node = child;
    }
    node.replacement ??= to;
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

const v1Pairs = buildPairs(v1Dictionary);
const overlayPairs = buildPairs(overlayDictionary, [0x1e, 0x7f], "\x1f", 0x20);
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

/** Mine frequent n-grams; prefer longer × count. Skip anything already in base dicts. */
function mineNgrams(texts, { minLen = 4, maxLen = 48, topN = 80, exclude = new Set() } = {}) {
  const counts = new Map();
  for (const text of texts) {
    if (!text) continue;
    for (let len = minLen; len <= maxLen; len++) {
      const step = Math.max(1, Math.floor(len / 4));
      for (let i = 0; i + len <= text.length; i += step) {
        const gram = text.slice(i, i + len);
        if (exclude.has(gram)) continue;
        // Prefer printable / structured tokens
        if (/[\x00-\x08\x0b\x0e-\x1f]/.test(gram)) continue;
        counts.set(gram, (counts.get(gram) || 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([g, n]) => ({ g, n, score: n * g.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.g);
}

/** Curated seed patterns per kind (domain knowledge, not just mining). */
const KIND_SEEDS = {
  markdown: [
    "\n## ",
    "\n### ",
    "\n#### ",
    "\n- ",
    "\n* ",
    "\n1. ",
    "\n2. ",
    "\n3. ",
    "\n```",
    "```\n",
    "\n> ",
    "\n| ",
    " | ",
    " |\n",
    "| ---",
    "---|",
    "**",
    "__",
    "](http",
    "](https://",
    "![",
    "---\n",
    "\n\n",
    "```ts",
    "```js",
    "```json",
    "```bash",
    "```mermaid",
    "graph TD",
    "flowchart ",
  ],
  code: [
    "export function ",
    "export async function ",
    "export const ",
    "export default ",
    "import { ",
    "import type ",
    '} from "',
    ' from "',
    "return ",
    "async ",
    "await ",
    "const ",
    "function ",
    "interface ",
    "type ",
    "extends ",
    "implements ",
    "typeof ",
    "instanceof ",
    "undefined",
    "null",
    "true",
    "false",
    "=> {",
    "): ",
    "?: ",
    " as ",
    "useState",
    "useEffect",
    "useCallback",
    "useMemo",
    "useRef",
    "className",
    "console.",
    "document.",
    "window.",
    "Promise<",
    "Record<",
    "Array<",
    "string",
    "number",
    "boolean",
    "void",
    "throw new ",
    "try {",
    "catch (",
    "if (!",
    "if (",
    "} else {",
    "for (const ",
    "for (let ",
    "while (",
    "switch (",
    "case ",
    "break;",
    "continue;",
    "=== ",
    "!== ",
    "&& ",
    "|| ",
  ],
  json: [
    '"name":',
    '"version":',
    '"private":',
    '"scripts":',
    '"dependencies":',
    '"devDependencies":',
    '"description":',
    '"license":',
    '"main":',
    '"type":',
    '"exports":',
    '"imports":',
    '"engines":',
    '"repository":',
    '"keywords":',
    '"author":',
    '"homepage":',
    '"bugs":',
    "true",
    "false",
    "null",
    '": "',
    '": {',
    '": [',
    '"},',
    '"],',
    "{\n",
    "},\n",
    "[\n",
    "],\n",
  ],
  csv: [",", "\n", '"', "true", "false", "null", "0,", "1,", "2,", "3,"],
  diff: [
    "diff --git ",
    "--- a/",
    "+++ b/",
    "@@ -",
    "\n+",
    "\n-",
    "\n ",
    "index ",
    "new file mode ",
    "deleted file mode ",
    "similarity index ",
    "rename from ",
    "rename to ",
  ],
};

// Existing dict strings — don't re-mine them into kind overlays
const existingSlots = new Set([
  ...v1Dictionary.singleByteSlots,
  ...v1Dictionary.extendedSlots,
  ...overlayDictionary.singleByteSlots,
  ...overlayDictionary.extendedSlots,
]);

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

const diffFixture = [
  "diff --git a/src/lib/payload/fragment.ts b/src/lib/payload/fragment.ts",
  "index 1111111..2222222 100644",
  "--- a/src/lib/payload/fragment.ts",
  "+++ b/src/lib/payload/fragment.ts",
  "@@ -10,8 +10,12 @@ export function encodeEnvelope(envelope) {",
  "   const json = JSON.stringify(envelope);",
  "-  return encodeDeflate(json);",
  "+  if (options?.codec === 'arx3') {",
  "+    return encodeArx3(json);",
  "+  }",
  "+  return encodeDeflate(json);",
  " }",
  "",
].join("\n");

const corpus = [
  {
    name: "markdown-agents",
    kind: "markdown",
    envelope: textEnvelope("markdown", "AGENTS.md excerpt", markdownAgentsFixture, { filename: "AGENTS.md" }),
  },
  {
    name: "code-bench-report",
    kind: "markdown",
    envelope: textEnvelope("markdown", "Baanish Code Bench", codeBenchReportFixture, { filename: "results.md" }),
  },
  {
    name: "code-fragment",
    kind: "code",
    envelope: textEnvelope("code", "fragment.ts excerpt", codeFragmentFixture, {
      filename: "fragment.ts",
      language: "ts",
    }),
  },
  {
    name: "json-package",
    kind: "json",
    envelope: textEnvelope("json", "package.json", packageManifestFixture, { filename: "package.json" }),
  },
  {
    name: "csv-leaderboard",
    kind: "csv",
    envelope: textEnvelope("csv", "Leaderboard", csvFixture, { filename: "board.csv" }),
  },
  {
    name: "diff-fragment",
    kind: "diff",
    envelope: {
      v: 1,
      codec: "plain",
      title: "fragment.ts patch",
      activeArtifactId: "a",
      artifacts: [
        {
          id: "a",
          kind: "diff",
          title: "fragment.ts patch",
          filename: "fragment.ts",
          patch: diffFixture,
          view: "unified",
        },
      ],
    },
  },
  {
    name: "small-markdown",
    kind: "markdown",
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

function contentOf(envelope) {
  const a = envelope.artifacts[0];
  return a.content ?? a.patch ?? "";
}

/** Build a kind overlay: seeds + LOO-mined n-grams, capped to fit extended-slot budget. */
function buildKindOverlay(kind, holdOutIndex, { maxSlots = 64 } = {}) {
  const siblings = corpus
    .map((row, i) => ({ row, i }))
    .filter(({ row, i }) => row.kind === kind && i !== holdOutIndex)
    .map(({ row }) => contentOf(row.envelope));

  // Also allow cross-fixture same-kind mining; if only one fixture of that kind,
  // fall back to seeds only (honest cold kind dict).
  const mined =
    siblings.length > 0
      ? mineNgrams(siblings, { topN: maxSlots, exclude: existingSlots })
      : [];

  const seeds = (KIND_SEEDS[kind] ?? []).filter((s) => !existingSlots.has(s));
  const merged = [];
  const seen = new Set();
  for (const g of [...seeds, ...mined]) {
    if (seen.has(g) || existingSlots.has(g)) continue;
    // Drop patterns already covered as substrings of longer kept patterns? keep simple.
    seen.add(g);
    merged.push(g);
    if (merged.length >= maxSlots) break;
  }
  return merged;
}

/**
 * Kind-dict encode path:
 *   tuple JSON → arx2 overlay → v1 dict → kind overlay → brotli
 * Kind overlay uses a fresh code space (0x1d prefix + index) so it doesn't
 * collide with v1 (0x00) or arx2 (0x1f) extended prefixes.
 */
function encodeWithKindOverlay(envelope, kindSlots) {
  const base = encodeArx3Substituted(envelope);
  if (!kindSlots.length) return base;
  const kindPairs = kindSlots.map((slot, i) => [slot, "\x1d" + String.fromCharCode(i + 0x20)]);
  const kindTrie = buildTrie(kindPairs);
  return applyTrie(base, kindTrie);
}

/**
 * Replace-mode: rebuild v1-like dict where extended slots are kind-biased.
 * Keeps v1 single-byte envelope chrome; swaps the long English/JS tail for kind slots.
 */
function encodeWithReplacedExtended(envelope, kindSlots) {
  const keepSingles = v1Dictionary.singleByteSlots;
  // Keep first ~40 extended (view/diff/js core), replace the rest with kind slots
  const keepExt = v1Dictionary.extendedSlots.slice(0, 40);
  const replaced = [...keepExt];
  for (const slot of kindSlots) {
    if (replaced.includes(slot)) continue;
    replaced.push(slot);
    if (replaced.length >= v1Dictionary.extendedSlots.length) break;
  }
  // Pad with leftovers from original if short
  for (const slot of v1Dictionary.extendedSlots) {
    if (replaced.length >= v1Dictionary.extendedSlots.length) break;
    if (!replaced.includes(slot)) replaced.push(slot);
  }
  const customDict = { singleByteSlots: keepSingles, extendedSlots: replaced };
  const customPairs = buildPairs(customDict);
  const customTrie = buildTrie(customPairs);
  const tupleJson = JSON.stringify(tupleEnvelope({ ...envelope, codec: "arx3" }));
  return applyTrie(applyTrie(tupleJson, overlayEncodeTrie), customTrie);
}

function pack(raw) {
  const bytes = brotli(raw).length;
  return { brotliBytes: bytes, bmpChars: baseBmpChars(bytes) };
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

function discordFraming(tag = "c") {
  const open = `[Artifact](https://agent-render.com#${tag}`;
  return {
    framingLength: open.length + 1,
    payloadBudget: DISCORD_MESSAGE_MAX - open.length - 1,
  };
}

const t0 = performance.now();
const rows = corpus.map((item, index) => {
  const kind = item.kind;
  const kindSlots = buildKindOverlay(kind, index, { maxSlots: 64 });
  const arx3 = pack(encodeArx3Substituted(item.envelope));
  const kindExtra = pack(encodeWithKindOverlay(item.envelope, kindSlots));
  const kindReplace = pack(encodeWithReplacedExtended(item.envelope, kindSlots));

  // Tag cost models on Discord markdown-link length (BMP chars ≈ fragment payload chars for baseBMP)
  const freeTagBmp = kindExtra.bmpChars; // tag `m` same length as `c`
  const plusOneBmp = kindExtra.bmpChars + 1; // selector after `c`
  const freeTagReplace = kindReplace.bmpChars;
  const plusOneReplace = kindReplace.bmpChars + 1;

  const bestKindBmp = Math.min(freeTagBmp, freeTagReplace);
  const bestKindPlusOne = Math.min(plusOneBmp, plusOneReplace);
  const beatsArx3Free = bestKindBmp < arx3.bmpChars;
  const beatsArx3PlusOne = bestKindPlusOne < arx3.bmpChars;
  const charsSavedFree = arx3.bmpChars - bestKindBmp;
  const charsSavedPlusOne = arx3.bmpChars - bestKindPlusOne;

  return {
    name: item.name,
    kind,
    rawChars: contentOf(item.envelope).length,
    kindSlotCount: kindSlots.length,
    kindSlotSample: kindSlots.slice(0, 8),
    arx3,
    kindExtra,
    kindReplace,
    freeTagBmp: bestKindBmp,
    plusOneBmp: bestKindPlusOne,
    beatsArx3Free,
    beatsArx3PlusOne,
    charsSavedFree,
    charsSavedPlusOne,
  };
});
const elapsed = performance.now() - t0;

const sum = (sel) => rows.reduce((n, r) => n + sel(r), 0);
const arx3Bmp = sum((r) => r.arx3.bmpChars);
const freeBmp = sum((r) => r.freeTagBmp);
const plusOneBmp = sum((r) => r.plusOneBmp);

const lines = [];
const w = (s = "") => lines.push(s);

w("# ARX4 kind-specific dictionaries");
w();
w("_Experimental notes from `scripts/bench-arx4-kind-dicts.mjs`. Not a shipped codec._");
w();
w("## The question");
w();
w("> Worth spending one char to potentially save thousands?");
w();
w("Two separate questions:");
w();
w("1. **Do kind-tuned substitution dicts beat the shared ARX3 dict** on held-out (LOO) fixtures?");
w("2. **What does selection cost on the wire?**");
w();
w("### Tag-cost menu (you often pay **zero**)");
w();
w("| Selector | Extra fragment chars | Notes |");
w("| --- | ---: | --- |");
w("| **Free kind tags** (`m` md, `k` code, `j` json, `s` csv, `f` diff, …) | **0** | Unused RFC-3986 unreserved tags; same length as today’s `c` |");
w("| `c` + 1 selector digit/byte | **+1** | Only needed if you refuse new tags |");
w("| Infer from envelope kind | **0** | Kind already in tuple — but decode must learn kind *before* reversing kind-substitution (peek or staged decode) |");
w();
w("So: **do not spend a char unless free tags are off the table.** The interesting bar is");
w("`kindDictBmp < arx3Bmp` (free tag) or `kindDictBmp + 1 < arx3Bmp` (+1 selector).");
w();
w("“Save thousands” is the wrong unit for Discord: one BMP char ≈ 2 brotli bytes.");
w("A kind dict that saves **tens to hundreds** of BMP chars is already a real Discord win;");
w("thousands of BMP chars would mean megabytes of source, which agents should **split**");
w("semantically (see skill), not mosaic.");
w();

w("## Method");
w();
w("- Baseline: ARX3 path (tuple JSON → arx2 overlay → v1 dict → Brotli q11 → baseBMP chars).");
w("- Kind overlay (**extra**): same path, then a third substitution layer from kind seeds +");
w("  leave-one-out mined n-grams (max 64 slots, fresh `0x1d` code space).");
w("- Kind replace: keep v1 singles + first 40 extended; replace the long English/JS tail with");
w("  kind slots (same slot budget as today).");
w("- LOO: mined patterns never see the measured fixture.");
w();

w("## Per-fixture results");
w();
w(
  "| Fixture | kind | raw | ARX3 BMP | kind-extra BMP | kind-replace BMP | best free-tag | vs ARX3 | best +1 sel | vs ARX3 | slots |",
);
w("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
for (const r of rows) {
  w(
    `| ${r.name} | ${r.kind} | ${r.rawChars} | ${r.arx3.bmpChars} | ${r.kindExtra.bmpChars} (${fmtDelta(r.arx3.bmpChars, r.kindExtra.bmpChars)}) | ${r.kindReplace.bmpChars} (${fmtDelta(r.arx3.bmpChars, r.kindReplace.bmpChars)}) | ${r.freeTagBmp} | ${fmtDelta(r.arx3.bmpChars, r.freeTagBmp)} | ${r.plusOneBmp} | ${fmtDelta(r.arx3.bmpChars, r.plusOneBmp)} | ${r.kindSlotCount} |`,
  );
}

w();
w("## Corpus totals");
w();
w("| Variant | Σ BMP | vs ARX3 |");
w("| --- | ---: | ---: |");
w(`| ARX3 (shared dict) | ${arx3Bmp} | 0.0% |`);
w(`| Kind dict, free tag | ${freeBmp} | ${fmtDelta(arx3Bmp, freeBmp)} |`);
w(`| Kind dict, +1 selector | ${plusOneBmp} | ${fmtDelta(arx3Bmp, plusOneBmp)} |`);
w();
w(`Fixtures where free-tag kind dict beats ARX3: **${rows.filter((r) => r.beatsArx3Free).length}/${rows.length}**`);
w(`Fixtures where +1 selector still beats ARX3: **${rows.filter((r) => r.beatsArx3PlusOne).length}/${rows.length}**`);
w(`Σ BMP chars saved (free tag): **${arx3Bmp - freeBmp}** (${fmtDelta(arx3Bmp, freeBmp)})`);
w(`Σ BMP chars saved (+1 sel): **${arx3Bmp - plusOneBmp}** (${fmtDelta(arx3Bmp, plusOneBmp)})`);
w();

w("## Sample kind slots (first 8, LOO)");
w();
for (const r of rows) {
  w(`- **${r.name}** (${r.kind}, ${r.kindSlotCount} slots): ${r.kindSlotSample.map((s) => `\`${JSON.stringify(s)}\``).join(", ") || "_(seeds only / empty)_"}`);
}

w();
w("## Verdict");
w();
w("### Is +1 char worth it?");
w();
if (arx3Bmp - plusOneBmp > 10) {
  w(
    `On this corpus, **yes if you somehow cannot use free tags** — net Σ save is **${arx3Bmp - plusOneBmp} BMP chars** after paying +1/fixture. But prefer free tags first.`,
  );
} else if (arx3Bmp - freeBmp > 10) {
  w(
    `**Only with free tags.** Free-tag kind dicts save **${arx3Bmp - freeBmp} BMP chars** corpus-wide; after a +1 selector the net is **${arx3Bmp - plusOneBmp}** — not worth a dedicated selector char.`,
  );
} else {
  w(
    `**Not on this corpus.** Kind dicts do not clearly beat shared ARX3 after LOO (Σ free-tag Δ ${fmtDelta(arx3Bmp, freeBmp)}). Do not spend a selector char; do not ship kind tags yet without a larger held-out gate.`,
  );
}
w();
w("### Practical recommendation");
w();
w("1. **Prefer free kind tags over a +1 selector** if kind dicts ever clear a held-out gate.");
w("   One char of framing is ~2 brotli bytes — tiny, but free is free, and unused tags exist.");
w("2. **Do not expect “thousands” of chars saved** from dict specialization on Discord-sized");
w("   payloads. Wins look like **tens of BMP chars** on kind-homogeneous artifacts, when they win.");
w("3. **Agents should split oversized artifacts semantically** (skill guidance) — separate report");
w("   sections / files — not mosaic reassembly protocols.");
w("4. Next measurement gate: larger per-kind held-out corpus (real agent markdown vs TS vs");
w("   package.json vs unified diffs). This bench’s LOO set is thin for csv/diff/json.");
w();
w("## Non-goals");
w();
w("- Not shipping kind tags or new dictionaries in this pass.");
w("- Not updating AGENTS.md as if ARX4 ships.");
w("- Not reviving mosaic assemblers.");
w();
w("## How to re-run");
w();
w("```bash");
w("npm run bench:arx4-kind-dicts");
w("# or: node scripts/bench-arx4-kind-dicts.mjs");
w("```");
w();
w(`_Generated in ${elapsed.toFixed(1)}ms._`);

writeFileSync(REPORT_PATH, lines.join("\n") + "\n");
console.log(`Wrote ${REPORT_PATH}`);
console.log(
  `ARX3 Σ ${arx3Bmp} → free-tag ${freeBmp} (${fmtDelta(arx3Bmp, freeBmp)}), +1sel ${plusOneBmp} (${fmtDelta(arx3Bmp, plusOneBmp)})`,
);
console.log(
  `beats free ${rows.filter((r) => r.beatsArx3Free).length}/${rows.length}, +1 ${rows.filter((r) => r.beatsArx3PlusOne).length}/${rows.length}`,
);
