/** Reproduce the extra-pass general context ablations without rewriting any production model. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildSync, transformSync } from "esbuild";
import { extraModelCandidates } from "./extra-model-candidates.mjs";

const [corpusPath, outputPath, mode = "wire", requested = "baseline,skeleton_context,skeleton_number"] = process.argv.slice(2);
if (!corpusPath || !outputPath || !["bits", "wire"].includes(mode)) {
  throw new Error("Usage: node experiments/arx6/extra-model-ablation.mjs corpus.json results.json [bits|wire] [comma-separated candidates]");
}
const root = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = value => createHash("sha256").update(value).digest("hex");
const importSource = source => import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const codecSource = readFileSync(`${root}src/lib/payload/arx6-codec.ts`, "utf8");
const compiled = buildSync({
  stdin: {
    contents: `${codecSource}\nexport { envelopeToRawContainer, normalizeV2Envelope, encodeWire, decodeWire, encodeArx6String };
export { loadArxDictionarySync, loadArx2OverlayDictionarySync } from '@/lib/payload/arx-codec';
export { loadArx4PriorsSync, arx4PriorIdForEnvelope } from '@/lib/payload/arx4-codec';
export { formatMarkdownLink } from '@/lib/markdown-link';`,
    resolveDir: root, sourcefile: "src/lib/payload/arx6-codec.ts", loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", write: false,
  external: ["brotli-wasm"], tsconfig: `${root}tsconfig.json`,
});
const codec = await importSource(compiled.outputFiles[0].text);
for (const [asset, loader] of [
  ["arx-dictionary.json", "loadArxDictionarySync"],
  ["arx2-dictionary.json", "loadArx2OverlayDictionarySync"],
  ["arx4-priors.json", "loadArx4PriorsSync"],
]) codec[loader](JSON.parse(readFileSync(`${root}public/${asset}`, "utf8")));

const corpusBytes = readFileSync(corpusPath);
const corpus = JSON.parse(corpusBytes).map(sample => {
  const envelope = codec.normalizeV2Envelope(sample.envelope);
  return {
    ...sample,
    bytes: codec.encodeArx6String(codec.envelopeToRawContainer(envelope)),
    priors: [codec.arx4PriorIdForEnvelope(envelope), "n"],
  };
});
const results = {
  corpusSha256: sha256(corpusBytes), codecSourceSha256: sha256(codecSource), mode,
  scope: mode === "wire"
    ? "Standalone complete View Markdown links, CRC32 included; original g2 baseline versus proposed g3 models, kind/n prior competition. Not the automatic codec portfolio."
    : "Negative log2 model-probability cost on complete normalized raw containers, kind/n prior competition. Excludes arithmetic, length, checksum and URL framing.",
  note: "Noisy exploratory timings include allocation and priming. Model source is generated from pinned g2 without editing it. Wire mode checks exact raw-byte round trips.",
  variants: {},
};
function allocatedBytes(model) {
  const buffers = new Set();
  function visit(value) {
    if (value === null || typeof value !== "object") return;
    if (ArrayBuffer.isView(value)) { buffers.add(value.buffer); return; }
    for (const child of Object.values(value)) visit(child);
  }
  visit(model);
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}
for (const name of requested.split(",")) {
  const source = extraModelCandidates[name];
  if (!source) throw new Error(`Unknown candidate: ${name}`);
  const { Arx6V2ContextModel: Model } = await importSource(transformSync(source, { loader: "ts", format: "esm", target: "es2022" }).code);
  const rows = [];
  const start = performance.now();
  for (const sample of corpus) {
    const trials = [];
    for (const priorId of sample.priors) {
      const model = new Model();
      const prime = codec.arx6PriorBytes(priorId);
      const header = `${name === "baseline" ? "g2" : "g3"}${priorId}`;
      const encodeStart = performance.now();
      if (mode === "bits") {
        for (const byte of prime ?? []) model.processKnownByte(byte, () => {});
        let bits = 0;
        for (const byte of sample.bytes) model.processKnownByte(byte, (p, b) => { bits -= Math.log2((b ? p : 4096 - p) / 4096); });
        trials.push({ priorId, bits, encodeMs: performance.now() - encodeStart });
      } else {
        const wire = header + codec.encodeWire(sample.bytes, prime, model, header);
        const url = new URL("https://agent-render.com/");
        url.hash = wire;
        trials.push({ priorId, wire, chars: codec.formatMarkdownLink("View", url.href).length, encodeMs: performance.now() - encodeStart });
      }
    }
    const metric = mode === "bits" ? "bits" : "chars";
    trials.sort((a, b) => a[metric] - b[metric]);
    const chosen = trials[0];
    if (mode === "wire") {
      assert.deepEqual(codec.decodeWire(chosen.wire.slice(3), codec.arx6PriorBytes(chosen.priorId), () => new Model(), chosen.wire.slice(0, 3)), sample.bytes, `${name}: ${sample.id}`);
    }
    rows.push({
      id: sample.id, family: sample.family, [metric]: chosen[metric], priorId: chosen.priorId,
      encodeMs: trials.reduce((sum, trial) => sum + trial.encodeMs, 0),
      ...(mode === "wire" ? { wireSha256: sha256(chosen.wire), roundTrip: true } : {}),
      trials: trials.map(({ wire: _wire, ...trial }) => trial),
    });
  }
  const metric = mode === "bits" ? "bits" : "chars";
  results.variants[name] = {
    sha256: sha256(source), allocatedBytes: allocatedBytes(new Model()), elapsedMs: performance.now() - start,
    [metric]: rows.reduce((sum, row) => sum + row[metric], 0), rows,
  };
  writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
  console.error(`${name}: ${results.variants[name][metric]} ${metric}, ${rows.length} samples`);
}
