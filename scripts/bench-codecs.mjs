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
const overlayPairs = buildPairs(
  overlayDictionary,
  [0x1e, 0x7f],
  "\x1f",
  0x20,
);

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
const v1DecodeTrie = buildTrie(v1Pairs, true);
const overlayEncodeTrie = buildTrie(overlayPairs);
const overlayDecodeTrie = buildTrie(overlayPairs, true);

function brotli(input) {
  return brotliCompressSync(Buffer.from(input, "utf8"), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  });
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
  const artifacts = new Array(envelope.artifacts.length);
  const activeArtifactId = envelope.activeArtifactId;
  let activeIndex = -1;

  for (let index = 0; index < envelope.artifacts.length; index++) {
    const artifact = envelope.artifacts[index];
    artifacts[index] = artifactTuple(artifact);

    if (artifact.id === activeArtifactId) {
      activeIndex = index;
    }
  }

  if (artifacts.length === 1) {
    return trimOptional([3, artifacts[0], envelope.title]);
  }
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
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
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

function repeatedFixture(block, targetLength, segmentSuffix = (index) => `\nfixture segment ${index}\n`) {
  let fixture = "";
  let index = 0;
  while (fixture.length < targetLength) {
    fixture += `${block}${segmentSuffix(index)}`;
    index++;
  }
  return fixture.slice(0, targetLength);
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
    "- Supported codecs are `plain`, `lz`, `deflate`, `arx`, and `arx2`.",
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
    "export async function encodeEnvelopeAsync(envelope: PayloadEnvelope, options: EncodeOptions = {}) {",
    "  const codec = options.codec ?? envelope.codec ?? \"deflate\";",
    "  if (codec === \"arx\" || codec === \"arx2\") {",
    "    const { encodeArxEnvelopeAsync } = await import(\"./fragment-arx\");",
    "    return encodeArxEnvelopeAsync(envelope, codec);",
    "  }",
    "  return encodeEnvelope(envelope, { codec });",
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
    scripts: {
      build: "next build",
      preview: "node scripts/serve-export.mjs",
      check: "npm run lint && npm run test && npm run bench:codecs && npm run typecheck && npm run build",
    },
    dependencies: {
      "@codemirror/view": "^6.38.2",
      "@git-diff-view/react": "^0.1.1",
      "brotli-wasm": "^3.0.1",
      "fflate": "^0.8.2",
      "lucide-react": "^0.577.0",
      "next": "15.1.11",
      "react": "19.1.0",
      "react-dom": "19.1.0",
      "react-markdown": "^10.1.0",
    },
    devDependencies: {
      "@playwright/test": "^1.58.2",
      "typescript": "^5.8.2",
      "vitest": "^4.0.18",
    },
  },
  null,
  2,
);

const readmeFixture = repeatedFixture(
  [
    "# agent-render",
    "",
    "A static, open artifact viewer for AI outputs.",
    "",
    "Paste content into the browser-side link creator, choose a renderer, and share the resulting fragment URL.",
    "The static host serves the shell; the browser decodes the artifact from the fragment.",
    "",
    "## Supported artifacts",
    "",
    "- Markdown with sanitized GFM and Mermaid fences.",
    "- Code with a read-only CodeMirror surface.",
    "- Review-style git patches with unified and split modes.",
    "- CSV tables and JSON trees.",
    "",
  ].join("\n"),
  9000,
  (index) => `\nFixture section ${index}: static export links should remain inspectable across chat clients.\n\n`,
);

const arxCodecFixture = repeatedFixture(
  [
    "const singleByteCodes = [0x01, 0x02, 0x03, 0x04, 0x05];",
    "function buildPairs(dictionary, prefix = \"\\\\x00\") {",
    "  return dictionary.extendedSlots.map((slot, index) => [slot, prefix + String.fromCharCode(index + 1)]);",
    "}",
    "function applyTrie(text, trie) {",
    "  const out = [];",
    "  let index = 0;",
    "  while (index < text.length) {",
    "    let node = trie;",
    "    let cursor = index;",
    "    let replacement;",
    "    while (cursor < text.length) {",
    "      node = node.children.get(text[cursor]);",
    "      if (!node) break;",
    "      cursor++;",
    "      if (node.replacement !== undefined) replacement = node.replacement;",
    "    }",
    "    out.push(replacement ?? text[index]);",
    "    index++;",
    "  }",
    "  return out.join(\"\");",
    "}",
    "",
  ].join("\n"),
  12000,
  (index) => `\n// fixture segment ${index}: trie substitutions and tuple overlays remain comparable.\n`,
);

const tsconfigFixture = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: false,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      paths: {
        "@/*": ["./src/*"],
      },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  },
  null,
  2,
);

const patch = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1 @@",
  "-export const value = 1;",
  "+export const value = 2;",
  "",
].join("\n").repeat(12);

const csvRows = ["name,value,notes"];
for (let index = 0; index < 180; index++) {
  csvRows.push(`row-${index},${index},"export const value ${index}"`);
}
const csv = csvRows.join("\n");

const corpus = [
  {
    name: "markdown-agents",
    kind: "markdown",
    envelope: textEnvelope("markdown", "AGENTS.md excerpt", markdownAgentsFixture, {
      filename: "AGENTS.md",
    }),
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
    envelope: textEnvelope("json", "package.json", packageManifestFixture, { filename: "package.json" }),
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
        { id: "readme", kind: "markdown", filename: "README.md", content: readmeFixture },
        {
          id: "source",
          kind: "code",
          filename: "arx-codec.ts",
          language: "ts",
          content: arxCodecFixture,
        },
        { id: "patch", kind: "diff", filename: "bundle.patch", patch, view: "split" },
        { id: "table", kind: "csv", filename: "table.csv", content: csv.slice(0, 1200) },
        { id: "manifest", kind: "json", filename: "tsconfig.json", content: tsconfigFixture },
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
  rows: {},
};

for (const row of rows) {
  baseline.rows[row.id] = { encodedBytes: row.encodedBytes };
}

if (WRITE_BASELINE) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

const table = [
  "| codec | kind | name | raw B | encoded B | ratio | encode ms | decode ms |",
  "|---|---:|---|---:|---:|---:|---:|---:|",
];

for (const row of rows) {
  table.push(`| ${row.codec} | ${row.kind} | ${row.name} | ${row.rawBytes} | ${row.encodedBytes} | ${row.ratio.toFixed(2)}x | ${row.encodeMs.toFixed(2)} | ${row.decodeMs.toFixed(2)} |`);
}

console.log(table.join("\n"));

const totals = {};
for (const row of rows) {
  totals[row.codec] = (totals[row.codec] ?? 0) + row.encodedBytes;
}
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
