#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { encode } from "gpt-tokenizer/encoding/o200k_base";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPORT_PATH = fileURLToPath(new URL("../docs/token-bench-report.md", import.meta.url));

process.chdir(ROOT);

const bridgeDirectory = mkdtempSync(join(ROOT, ".token-bench-"));
const bridgePath = join(bridgeDirectory, "codec-bridge.mjs");
let codecModule;

try {
  await build({
    alias: {
      "brotli-wasm": join(ROOT, "node_modules/brotli-wasm/index.node.js"),
    },
    stdin: {
      contents: [
        'export { encodeEnvelope, getFragmentTransportLength, getVisibleFragmentLength } from "./src/lib/payload/fragment.ts";',
        'export { buildArxCandidates, buildArx2Candidates, buildArx3Candidates, buildArx4Candidates } from "./src/lib/payload/fragment-arx.ts";',
        'export { isBase1kEncoded, isBase64urlEncoded, isBaseBMPEncoded, loadArxDictionarySync, loadArx2OverlayDictionarySync } from "./src/lib/payload/arx-codec.ts";',
        'export { loadArx4PriorsSync } from "./src/lib/payload/arx4-codec.ts";',
      ].join("\n"),
      resolveDir: ROOT,
      sourcefile: "token-bench-codec-bridge.ts",
    },
    bundle: true,
    external: [join(ROOT, "node_modules/brotli-wasm/index.node.js")],
    format: "esm",
    outfile: bridgePath,
    platform: "node",
    tsconfig: join(ROOT, "tsconfig.json"),
  });
  codecModule = await import(pathToFileURL(bridgePath).href);
} finally {
  rmSync(bridgeDirectory, { recursive: true, force: true });
}

const {
  encodeEnvelope,
  getFragmentTransportLength,
  getVisibleFragmentLength,
  buildArxCandidates,
  buildArx2Candidates,
  buildArx3Candidates,
  buildArx4Candidates,
  isBase1kEncoded,
  isBase64urlEncoded,
  isBaseBMPEncoded,
  loadArxDictionarySync,
  loadArx2OverlayDictionarySync,
  loadArx4PriorsSync,
} = codecModule;

loadArxDictionarySync(JSON.parse(readFileSync("public/arx-dictionary.json", "utf8")));
loadArx2OverlayDictionarySync(JSON.parse(readFileSync("public/arx2-dictionary.json", "utf8")));
loadArx4PriorsSync(JSON.parse(readFileSync("public/arx4-priors.json", "utf8")));

const codeBenchReportFixture = readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8");

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
      typescript: "^5.8.2",
      vitest: "^4.0.18",
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
    name: "code-bench-report",
    kind: "markdown",
    envelope: textEnvelope("markdown", "Baanish Code Bench", codeBenchReportFixture, {
      filename: "results.md",
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

function identifyArxWire(fragment, codec) {
  const payload = fragment.slice(codec === "arx4" ? 2 : 1);
  if (isBaseBMPEncoded(payload)) return "baseBMP";
  if (isBase64urlEncoded(payload)) return "base64url";
  if (isBase1kEncoded(payload)) return "base1k";
  return "base76";
}

function shortestCandidate(candidates) {
  return candidates.reduce((shortest, candidate) => (
    candidate.transportLength < shortest.transportLength ? candidate : shortest
  ));
}

function rowFor(entry, codec, wire, fragment) {
  return {
    sample: entry.name,
    kind: entry.kind,
    codec,
    wire,
    visibleChars: getVisibleFragmentLength(fragment),
    transportChars: getFragmentTransportLength(fragment),
    tokens: encode(fragment).length,
  };
}

function candidateForWire(candidates, codec, wire) {
  const candidate = candidates.find((item) => identifyArxWire(item.value, codec) === wire);
  if (!candidate) {
    throw new Error(`Missing ${codec} ${wire} candidate.`);
  }
  return candidate;
}

const rows = [];

for (const entry of corpus) {
  for (const codec of ["plain", "lz", "deflate"]) {
    const fragment = encodeEnvelope(entry.envelope, { codec });
    rows.push(rowFor(entry, codec, codec === "lz" ? "uri-safe" : "base64url", fragment));
  }

  const arxCandidates = [
    ...await buildArxCandidates(entry.envelope, true, getFragmentTransportLength),
    ...await buildArxCandidates(entry.envelope, false, getFragmentTransportLength),
  ];
  const selectedArx = shortestCandidate(arxCandidates);
  rows.push(rowFor(entry, "arx", identifyArxWire(selectedArx.value, "arx"), selectedArx.value));

  const arx2Candidates = await buildArx2Candidates(entry.envelope, getFragmentTransportLength);
  const selectedArx2 = shortestCandidate(arx2Candidates);
  rows.push(rowFor(entry, "arx2", identifyArxWire(selectedArx2.value, "arx2"), selectedArx2.value));

  const arx3Candidates = await buildArx3Candidates(entry.envelope, getFragmentTransportLength);
  for (const wire of ["base64url", "baseBMP"]) {
    const candidate = candidateForWire(arx3Candidates, "arx3", wire);
    rows.push(rowFor(entry, "arx3", wire, candidate.value));
  }

  const arx4Candidates = await buildArx4Candidates(entry.envelope, getFragmentTransportLength);
  for (const wire of ["base64url", "baseBMP"]) {
    const candidate = candidateForWire(arx4Candidates, "arx4", wire);
    rows.push(rowFor(entry, "arx4", wire, candidate.value));
  }
}

const table = [
  "| sample | kind | codec | wire | visible fragment chars | percent-encoded transport chars | o200k_base tokens |",
  "|---|---|---|---|---:|---:|---:|",
  ...rows.map((row) => (
    `| ${row.sample} | ${row.kind} | ${row.codec} | ${row.wire} | ${row.visibleChars} | ${row.transportChars} | ${row.tokens} |`
  )),
];

const bmpComparisons = [];
for (const entry of corpus) {
  for (const codec of ["arx3", "arx4"]) {
    const base64url = rows.find((row) => (
      row.sample === entry.name && row.codec === codec && row.wire === "base64url"
    ));
    const baseBMP = rows.find((row) => (
      row.sample === entry.name && row.codec === codec && row.wire === "baseBMP"
    ));
    const tokenDelta = baseBMP.tokens - base64url.tokens;
    bmpComparisons.push({
      sample: entry.name,
      codec,
      tokenDelta,
      percentDelta: tokenDelta / base64url.tokens,
    });
  }
}

const averageTokenDelta = bmpComparisons.reduce((sum, item) => sum + item.tokenDelta, 0) / bmpComparisons.length;
const averagePercentDelta = bmpComparisons.reduce((sum, item) => sum + item.percentDelta, 0) / bmpComparisons.length;
const worstComparison = bmpComparisons.reduce((worst, item) => (
  item.percentDelta > worst.percentDelta ? item : worst
));
const baseBmpLoses = averageTokenDelta > 0;

const kindWinners = [];
for (const kind of [...new Set(corpus.map((entry) => entry.kind))]) {
  const totals = new Map();
  for (const row of rows.filter((item) => item.kind === kind)) {
    const combination = `${row.codec}/${row.wire}`;
    totals.set(combination, (totals.get(combination) ?? 0) + row.tokens);
  }
  const [combination, tokens] = [...totals.entries()].reduce((best, item) => (
    item[1] < best[1] ? item : best
  ));
  kindWinners.push({ kind, combination, tokens });
}

const conclusions = [
  "## Conclusions",
  "",
  `BaseBMP ${baseBmpLoses ? "loses" : "does not lose"} to base64url on o200k_base tokens on average. Across ${bmpComparisons.length} matched ARX3/ARX4 sample pairs, baseBMP uses ${Math.abs(averagePercentDelta * 100).toFixed(2)}% ${averagePercentDelta >= 0 ? "more" : "fewer"} tokens on average (${Math.abs(averageTokenDelta).toFixed(1)} ${averageTokenDelta >= 0 ? "more" : "fewer"} tokens per fragment).`,
  "",
  `The worst case is ${worstComparison.sample} with ${worstComparison.codec}: baseBMP uses ${(worstComparison.percentDelta * 100).toFixed(2)}% more tokens (${worstComparison.tokenDelta} tokens) than base64url.`,
  "",
  "Token-optimal codec/wire combination per sample kind (summing samples when a kind has more than one fixture):",
  "",
  ...kindWinners.map((winner) => `- ${winner.kind}: ${winner.combination} (${winner.tokens} tokens)`),
  "",
  "These o200k_base counts are directional, not exact, for Claude tokenizers.",
];

const report = [
  "# Fragment codec token benchmark",
  "",
  "This benchmark reuses the corpus from `scripts/bench-codecs.mjs`. It measures the compact fragment body (codec tag plus payload), uses agent-render's conservative percent-escaped transport metric, and tokenizes with `gpt-tokenizer`'s `o200k_base` encoding.",
  "",
  "ARX and ARX2 report the wire selected by the current transport-length policy. ARX3 and ARX4 report matched base64url and baseBMP variants produced from the same compressed/coded bytes. The o200k_base counts are directional for Claude tokenizers.",
  "",
  ...table,
  "",
  ...conclusions,
  "",
].join("\n");

writeFileSync(REPORT_PATH, report);
console.log(report);
