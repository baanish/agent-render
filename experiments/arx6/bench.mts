/** Compare ARX6 with the complete production auto pool; run with node --import tsx. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createLabCodec, envelopeToTuple, priorForEnvelope } from "./runtime.mjs";
import { formatMarkdownLink } from "@/lib/markdown-link";
import { normalizeEnvelope } from "@/lib/payload/envelope";
import { encodeEnvelopeAsync, decodeFragmentAsync } from "@/lib/payload/fragment";
import { isPayloadEnvelope, MAX_DECODED_PAYLOAD_LENGTH } from "@/lib/payload/schema";
import { loadArxDictionarySync, loadArx2OverlayDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync } from "@/lib/payload/arx4-codec";
import base from "../../public/arx-dictionary.json";
import overlay from "../../public/arx2-dictionary.json";
import priors from "../../public/arx4-priors.json";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node --import tsx experiments/arx6/bench.mts corpus.json");
const corpus: unknown = JSON.parse(readFileSync(inputPath, "utf8"));
if (!Array.isArray(corpus) || corpus.length === 0) throw new Error("Expected a nonempty array of {id, envelope} samples.");
loadArxDictionarySync(base);
loadArx2OverlayDictionarySync(overlay);
if (loadArx4PriorsSync(priors) !== 1) throw new Error("Production priors did not match their pins.");
const { codec } = await createLabCodec();

function link(fragmentBody: string): string {
  const url = new URL("https://agent-render.com/");
  url.hash = fragmentBody;
  return formatMarkdownLink("View", url.href);
}

const rows = [];
for (const [index, sample] of corpus.entries()) {
  if (sample === null || typeof sample !== "object" || !isPayloadEnvelope(sample.envelope)) {
    throw new Error(`Invalid sample envelope at index ${index}.`);
  }
  const normalized = normalizeEnvelope(sample.envelope);
  if (!normalized.ok) throw new Error(`Sample ${index}: ${normalized.message}`);
  const envelope = normalized.envelope;
  if (JSON.stringify(envelope).length > MAX_DECODED_PAYLOAD_LENGTH) throw new Error(`Sample ${index} exceeds the decoded budget.`);
  const baselineStart = performance.now();
  const legacy = await encodeEnvelopeAsync(envelope, { budgetByTransport: true });
  const baselineMs = performance.now() - baselineStart;
  const decoded = await decodeFragmentAsync(`#${legacy}`, { skipFragmentBudget: true });
  assert.ok(decoded.ok, `Production baseline failed to decode sample ${index}.`);
  assert.deepEqual({ ...decoded.envelope, codec: "plain" }, { ...envelope, codec: "plain" });
  const value = envelopeToTuple(envelope);
  const candidateStart = performance.now();
  const candidate = codec.encode(value, priorForEnvelope(envelope));
  const candidateMs = performance.now() - candidateStart;
  if (candidate !== null) assert.deepEqual(codec.decode(candidate), value);
  const baselineChars = link(legacy).length;
  const candidateChars = candidate === null ? null : link(candidate.slice(1)).length;
  const wins = candidateChars !== null && candidateChars < baselineChars;
  const selected = wins ? candidate!.slice(1) : legacy;
  // A tie/loss preserves the previous wire exactly; never wrap it in an ARX6 header.
  if (!wins) assert.equal(selected, legacy);
  rows.push({
    id: typeof sample.id === "string" ? sample.id : `sample-${index}`,
    kind: envelope.artifacts[0].kind,
    baselineTag: legacy.charAt(0), baselineChars, candidateChars,
    selectedChars: wins ? candidateChars : baselineChars, wins,
    baselineMs, candidateMs,
    candidateSha256: candidate === null ? null : createHash("sha256").update(candidate).digest("hex"),
  });
}
const baselineTotal = rows.reduce((n, row) => n + row.baselineChars, 0);
const selectedTotal = rows.reduce((n, row) => n + (row.selectedChars ?? row.baselineChars), 0);
console.log(JSON.stringify({
  baseline: "complete production encodeEnvelopeAsync auto pool, budgetByTransport=true",
  framing: "[View](https://agent-render.com/#...); includes every header and checksum character",
  note: "Experimental ARX6 wires are not registered in the viewer; no shareable links are emitted.",
  summary: {
    samples: rows.length, wins: rows.filter(row => row.wins).length,
    unavailableCandidates: rows.filter(row => row.candidateChars === null).length,
    baselineTotal, selectedTotal, savedPercent: 100 * (1 - selectedTotal / baselineTotal),
    baselineFits2000: rows.filter(row => row.baselineChars <= 2000).length,
    selectedFits2000: rows.filter(row => (row.selectedChars ?? row.baselineChars) <= 2000).length,
  }, rows,
}, null, 2));
