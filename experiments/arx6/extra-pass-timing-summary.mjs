/** Verify exact timing-run wires and summarize the added model/runtime pass. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(process.argv[2] ?? path.join(directory, 'results/extra-pass-timing.json'));
const outputPath = path.resolve(process.argv[3] ?? path.join(directory, 'results/extra-pass-timing-summary.json'));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const report = read(sourcePath);
const original = read(path.join(directory, 'results/consolidated-timing-original.json'));
const replay = read(path.join(directory, 'results/extra-pass-replay.json'));
assert.equal(report.corpusSha256, original.corpusSha256);
const baseline = report.variants.find(variant => variant.label === 'baseline-g2');
const candidate = report.variants.find(variant => variant.label === 'integrated-g3');
assert.ok(baseline && candidate);
const expected = {
  'baseline-g2': original.variants.find(variant => variant.label === 'final').rows,
  'integrated-g3': replay.variants.find(variant => variant.label === 'integrated-g3').rows,
};
for (const variant of report.variants) {
  assert.equal(variant.rows.length, 78);
  const previous = new Map(expected[variant.label].map(row => [row.id, row]));
  for (const row of variant.rows) {
    assert.ok(row.roundTrip && Number.isFinite(row.encodeMs) && Number.isFinite(row.decodeMs));
    assert.ok(previous.get(row.id));
    for (const field of ['fragmentSha256', 'fragmentChars', 'markdownLinkChars', 'decodedJsonChars']) {
      assert.equal(row[field], previous.get(row.id)[field], `Timing run changed ${field}: ${row.id}`);
    }
  }
}
function quantiles(rows, field) {
  const values = rows.map(row => row[field]).sort((left, right) => left - right);
  const at = fraction => values[Math.min(values.length - 1, Math.floor(values.length * fraction))] ?? null;
  return { p50: at(0.5), p95: at(0.95), max: at(1) };
}
function summarize(rows) {
  return { samples: rows.length, encodeMs: quantiles(rows, 'encodeMs'), decodeMs: quantiles(rows, 'decodeMs'),
    encodeOver60Seconds: rows.filter(row => row.encodeMs > 60000).map(row => ({ id: row.id,
      encodeMs: row.encodeMs, fragmentChars: row.fragmentChars, markdownLinkChars: row.markdownLinkChars,
      shareableFragment: row.fragmentChars <= 8192 })) };
}
const commonShareable = new Set(baseline.rows.filter(row => row.fragmentChars <= 8192 &&
  candidate.rows.find(other => other.id === row.id)?.fragmentChars <= 8192).map(row => row.id));
const summary = {
  corpusSha256: report.corpusSha256,
  method: 'One ordered pass per variant after known heavy validation jobs stopped, with identical inputs. Timed encode/decode calls include lazy first-use costs; module imports and synchronous asset loading occur before the timed calls. No repeated statistical benchmark or mobile-device guarantee. Peak RSS includes the whole process.',
  scope: 'Baseline is exact commit 5d82b9f. Candidate combines the frozen g3 model and byte-preserving dominated-Unicode conversion pruning; timing differences cannot be attributed solely to either change. All 78 baseline wires match the historical g2 pass and all 78 g3 wires match the integrated 227-case replay.',
  sourceReport: { file: path.basename(sourcePath), sha256: createHash('sha256').update(readFileSync(sourcePath)).digest('hex') },
  exactWireMatches: { 'baseline-g2': baseline.rows.length, 'integrated-g3': candidate.rows.length },
  variants: report.variants.map(variant => ({ label: variant.label, revision: variant.revision,
    publishedEquivalentRevision: variant.publishedEquivalentRevision, revisionTree: variant.revisionTree, sourceSha256: variant.sourceSha256,
    startedAt: variant.startedAt, finishedAt: variant.finishedAt, runtime: variant.runtime, peakRssMiB: variant.peakRssKiB / 1024,
    all: summarize(variant.rows), shareableFragment8192: summarize(variant.rows.filter(row => row.fragmentChars <= 8192)),
    shareableByBoth8192: summarize(variant.rows.filter(row => commonShareable.has(row.id))),
    completeMarkdown2000: summarize(variant.rows.filter(row => row.markdownLinkChars <= 2000)),
    boundaries: variant.rows.filter(row => row.family.startsWith('timing-boundary-')),
  })),
};
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, ...summary }, null, 2)}\n`);
