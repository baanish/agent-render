/** Compare model candidates with identical production framing and pinned priors. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { buildSync, transformSync } from "esbuild";
import { modelCandidates } from "./model-candidates.mjs";

const [corpusPath, outputPath, requested = "baseline,direct_runs,classes_residual,lexical_residual_smaller,lexical_fold_optimized,lexical_fold_optimized@n"] = process.argv.slice(2);
if (!corpusPath || !outputPath) {
  throw new Error("Usage: node experiments/arx6/model-ablation.mjs corpus.json results.json [variant,variant@n,...]");
}
const root = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const moduleFromSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const codecSource = readFileSync(new URL("../../src/lib/payload/arx6-codec.ts", import.meta.url), "utf8");
// Export private research entry points from an in-memory bundle; never rewrite production source.
const bundle = buildSync({
  stdin: {
    contents: `${codecSource}\nexport { envelopeToRawContainer, normalizeV2Envelope, encodeWire, decodeWire, encodeArx6String };
export { loadArxDictionarySync, loadArx2OverlayDictionarySync } from '@/lib/payload/arx-codec';
export { loadArx4PriorsSync, arx4PriorIdForEnvelope } from '@/lib/payload/arx4-codec';
export { formatMarkdownLink } from '@/lib/markdown-link';`,
    resolveDir: root,
    sourcefile: "src/lib/payload/arx6-codec.ts",
    loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
  external: ["brotli-wasm"], tsconfig: `${root}tsconfig.json`,
});
const codec = await moduleFromSource(bundle.outputFiles[0].text);
for (const [asset, install] of [
  ["arx-dictionary.json", "loadArxDictionarySync"],
  ["arx2-dictionary.json", "loadArx2OverlayDictionarySync"],
  ["arx4-priors.json", "loadArx4PriorsSync"],
]) codec[install](JSON.parse(readFileSync(`${root}public/${asset}`, "utf8")));

const corpusBytes = readFileSync(corpusPath);
const corpus = JSON.parse(corpusBytes);
const variants = requested.split(",");
const results = {
  scope: "Model-only comparison: same production normalized raw container, WTF-8, composed priors, CRC residue and full Markdown link. This is not the auto-codec portfolio benchmark.",
  note: "Timings include model allocation and priming; one pass, not a performance guarantee. Every raw-container byte round-trips under its candidate model.",
  corpusSha256: sha256(corpusBytes), codecSourceSha256: sha256(codecSource),
  modelSourceSha256: {}, allocatedTypedArrayBytes: {}, variants: {},
};
function allocatedBytes(model) {
  const buffers = new Set();
  function visit(value) {
    if (value === null || typeof value !== "object") return;
    if (ArrayBuffer.isView(value)) { buffers.add(value.buffer); return; }
    for (const child of Object.values(value)) visit(child);
  }
  visit(model);
  return [...buffers].reduce((total, buffer) => total + buffer.byteLength, 0);
}
for (const variant of variants) {
  const [name, priorOverride] = variant.split("@");
  const source = modelCandidates[name];
  if (!source) throw new Error(`Unknown variant: ${name}`);
  const modelModule = await moduleFromSource(transformSync(source, { loader: "ts", format: "esm", target: "es2022" }).code);
  const Model = modelModule.Arx6ContextModel;
  results.modelSourceSha256[variant] = sha256(source);
  results.allocatedTypedArrayBytes[variant] = allocatedBytes(new Model());
  const rows = [];
  for (const sample of corpus) {
    const envelope = codec.normalizeV2Envelope(sample.envelope);
    const priorId = priorOverride ?? codec.arx4PriorIdForEnvelope(envelope);
    const prior = codec.arx6PriorBytes(priorId);
    const raw = codec.encodeArx6String(codec.envelopeToRawContainer(envelope));
    const header = `g2${priorId}`;
    const start = performance.now();
    const digits = codec.encodeWire(raw, prior, new Model(), header);
    const encodeMs = performance.now() - start;
    const decoded = codec.decodeWire(digits, prior, () => new Model(), header);
    assert.deepEqual(decoded, raw, `${variant}: ${sample.id}`);
    const wire = header + digits;
    const url = new URL("https://agent-render.com/");
    url.hash = wire;
    const link = codec.formatMarkdownLink("View", url.href);
    rows.push({
      id: sample.id, family: sample.family, kind: envelope.artifacts[0].kind,
      bytes: raw.length, priorId, priorBytes: prior?.length ?? 0,
      chars: link.length, encodeMs, wireSha256: sha256(wire), roundTrip: true,
    });
  }
  results.variants[variant] = rows;
  writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.error(`${variant}: ${rows.reduce((total, row) => total + row.chars, 0)} full-link characters; ${rows.length} byte-exact round trips`);
}
