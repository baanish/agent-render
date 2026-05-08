#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";

const BASELINE_PATH = "scripts/bench-baseline.json";
const WRITE_BASELINE = process.argv.includes("--write-baseline");
const MAX_BASELINE_REGRESSION = 0.005;
const MIN_ARX2_TOTAL_WIN = 0.005;

const v1Dictionary = JSON.parse(readFileSync("public/arx-dictionary.json", "utf8"));
const overlayDictionary = JSON.parse(readFileSync("public/arx2-dictionary.json", "utf8"));

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
const overlayPairs = [
  ...buildPairs({ singleByteSlots: overlayDictionary.singleByteSlots, extendedSlots: [] }, [0x1e, 0x7f]),
  ...overlayDictionary.extendedSlots.map((slot, index) => [slot, "\x1f" + String.fromCharCode(0x20 + index)]),
];

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

const v1EncodeTrie = buildTrie(v1Pairs);
const v1DecodeTrie = buildTrie(v1Pairs.map(([from, to]) => [to, from]));
const overlayEncodeTrie = buildTrie(overlayPairs);
const overlayDecodeTrie = buildTrie(overlayPairs.map(([from, to]) => [to, from]));

function brotli(input) {
  return brotliCompressSync(Buffer.from(input, "utf8"), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
}

function trimOptional(fields) {
  let end = fields.length;
  while (end > 0 && fields[end - 1] === undefined) end--;
  return fields.slice(0, end).map((field) => field === undefined ? null : field);
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
  if (artifacts.length === 1) {
    return trimOptional([3, artifacts[0], envelope.title]);
  }
  const activeIndex = envelope.activeArtifactId
    ? envelope.artifacts.findIndex((artifact) => artifact.id === envelope.activeArtifactId)
    : -1;
  return trimOptional([2, artifacts, envelope.title, activeIndex > 0 ? activeIndex : undefined]);
}

function encodeArx(envelope) {
  const json = JSON.stringify({ ...envelope, codec: "arx" });
  return applyTrie(json, v1EncodeTrie);
}

function encodeArx2(envelope) {
  const tupleJson = JSON.stringify(tupleEnvelope({ ...envelope, codec: "arx2" }));
  return applyTrie(applyTrie(tupleJson, overlayEncodeTrie), v1EncodeTrie);
}

function decodeArx(buf) {
  const substituted = brotliDecompressSync(buf).toString("utf8");
  return JSON.parse(applyTrie(substituted, v1DecodeTrie));
}

function decodeArx2(buf) {
  const substituted = brotliDecompressSync(buf).toString("utf8");
  return JSON.parse(applyTrie(applyTrie(substituted, v1DecodeTrie), overlayDecodeTrie));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function measure(fn, iterations = 7) {
  const samples = [];
  let result;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    result = fn();
    samples.push(performance.now() - start);
  }
  return { result, ms: median(samples) };
}

function textEnvelope(kind, title, content, extra = {}) {
  return {
    v: 1,
    codec: "plain",
    title,
    activeArtifactId: "a",
    artifacts: [
      {
        id: "a",
        kind,
        title,
        filename: extra.filename ?? "artifact.txt",
        content,
        ...extra,
      },
    ],
  };
}

const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1 @@",
  "-export const value = 1;",
  "+export const value = 2;",
  "",
].join("\n").repeat(12);

const csv = [
  "name,value,notes",
  ...Array.from({ length: 180 }, (_, index) => `row-${index},${index},"export const value ${index}"`),
].join("\n");

const corpus = [
  {
    name: "markdown-agents",
    kind: "markdown",
    envelope: textEnvelope("markdown", "AGENTS.md excerpt", readFileSync("AGENTS.md", "utf8").slice(0, 8000), {
      filename: "AGENTS.md",
    }),
  },
  {
    name: "code-fragment",
    kind: "code",
    envelope: textEnvelope("code", "fragment.ts excerpt", readFileSync("src/lib/payload/fragment.ts", "utf8").slice(0, 8000), {
      filename: "fragment.ts",
      language: "ts",
    }),
  },
  {
    name: "diff-patch",
    kind: "diff",
    envelope: {
      v: 1,
      codec: "plain",
      title: "Patch review",
      activeArtifactId: "patch",
      artifacts: [{ id: "patch", kind: "diff", filename: "change.patch", patch, view: "split" }],
    },
  },
  {
    name: "diff-pair",
    kind: "diff",
    envelope: {
      v: 1,
      codec: "plain",
      title: "Old/new diff",
      activeArtifactId: "pair",
      artifacts: [{
        id: "pair",
        kind: "diff",
        filename: "pair.ts",
        oldContent: "export const value = 1;\n".repeat(80),
        newContent: "export const value = 2;\n".repeat(80),
        language: "ts",
        view: "unified",
      }],
    },
  },
  {
    name: "csv-grid",
    kind: "csv",
    envelope: textEnvelope("csv", "CSV grid", csv, { filename: "grid.csv" }),
  },
  {
    name: "json-package",
    kind: "json",
    envelope: textEnvelope("json", "package.json", readFileSync("package.json", "utf8"), { filename: "package.json" }),
  },
  {
    name: "multi-bundle",
    kind: "bundle",
    envelope: {
      v: 1,
      codec: "plain",
      title: "Mixed bundle",
      activeArtifactId: "source",
      artifacts: [
        { id: "readme", kind: "markdown", filename: "README.md", content: readFileSync("README.md", "utf8") },
        {
          id: "source",
          kind: "code",
          filename: "arx-codec.ts",
          language: "ts",
          content: readFileSync("src/lib/payload/arx-codec.ts", "utf8").slice(0, 12000),
        },
        { id: "patch", kind: "diff", filename: "bundle.patch", patch, view: "split" },
        { id: "table", kind: "csv", filename: "table.csv", content: csv.slice(0, 1200) },
        { id: "manifest", kind: "json", filename: "tsconfig.json", content: readFileSync("tsconfig.json", "utf8") },
      ],
    },
  },
];

const rows = [];

for (const entry of corpus) {
  for (const codec of ["arx", "arx2"]) {
    const encoder = codec === "arx" ? encodeArx : encodeArx2;
    const decoder = codec === "arx" ? decodeArx : decodeArx2;
    const rawJson = JSON.stringify({ ...entry.envelope, codec });
    const encodedInput = encoder(entry.envelope);
    const encode = measure(() => brotli(encodedInput));
    const decode = measure(() => decoder(encode.result));

    rows.push({
      id: `${entry.name}:${codec}`,
      codec,
      kind: entry.kind,
      name: entry.name,
      rawBytes: Buffer.byteLength(rawJson, "utf8"),
      encodedBytes: encode.result.length,
      ratio: Buffer.byteLength(rawJson, "utf8") / encode.result.length,
      encodeMs: encode.ms,
      decodeMs: decode.ms,
    });
  }
}

const baseline = {
  version: 1,
  generatedAt: new Date().toISOString(),
  rows: Object.fromEntries(rows.map((row) => [row.id, { encodedBytes: row.encodedBytes }])),
};

if (WRITE_BASELINE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

const table = [
  "| codec | kind | name | raw B | encoded B | ratio | encode ms | decode ms |",
  "|---|---:|---|---:|---:|---:|---:|---:|",
  ...rows.map((row) => `| ${row.codec} | ${row.kind} | ${row.name} | ${row.rawBytes} | ${row.encodedBytes} | ${row.ratio.toFixed(2)}x | ${row.encodeMs.toFixed(2)} | ${row.decodeMs.toFixed(2)} |`),
];

console.log(table.join("\n"));

const totals = rows.reduce((acc, row) => {
  acc[row.codec] = (acc[row.codec] ?? 0) + row.encodedBytes;
  return acc;
}, {});
const arx2Win = (totals.arx - totals.arx2) / totals.arx;
console.log(`\nTotal arx: ${totals.arx} B`);
console.log(`Total arx2: ${totals.arx2} B`);
console.log(`arx2 delta: ${(arx2Win * 100).toFixed(2)}%`);

const failures = [];
if (arx2Win < MIN_ARX2_TOTAL_WIN) {
  failures.push(`arx2 total win ${(arx2Win * 100).toFixed(2)}% is below ${(MIN_ARX2_TOTAL_WIN * 100).toFixed(2)}%.`);
}

for (const entry of corpus) {
  const arx = rows.find((row) => row.id === `${entry.name}:arx`);
  const arx2 = rows.find((row) => row.id === `${entry.name}:arx2`);
  const delta = (arx.encodedBytes - arx2.encodedBytes) / arx.encodedBytes;
  if (delta < -MAX_BASELINE_REGRESSION) {
    failures.push(`${entry.name} arx2 regressed vs arx by ${(-delta * 100).toFixed(2)}%.`);
  }
}

if (!WRITE_BASELINE && existsSync(BASELINE_PATH)) {
  const committed = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  for (const row of rows) {
    const baselineRow = committed.rows?.[row.id];
    if (!baselineRow) {
      failures.push(`Missing baseline row for ${row.id}. Run npm run bench:codecs:update.`);
      continue;
    }
    const regression = (row.encodedBytes - baselineRow.encodedBytes) / baselineRow.encodedBytes;
    if (regression > MAX_BASELINE_REGRESSION) {
      failures.push(`${row.id} regressed ${(regression * 100).toFixed(2)}% vs baseline.`);
    }
  }
}

if (failures.length > 0) {
  console.error("\nBenchmark gate failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
