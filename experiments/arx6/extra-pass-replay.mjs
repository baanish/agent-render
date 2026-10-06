/** Reconstruct the extra-pass replay and verify integrated g3 against its frozen candidate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const file = name => path.join(directory, `results/${name}.json`);
const fresh = read(file('extra-pass-validation'));
const previousReplay = read(file('consolidated-replay'));
// Frozen union of the original 200 inputs and the separately reserved 27 inputs.
// IDs and decoded lengths alone do not establish that a replay used the same text.
const REPLAY_CORPUS_SHA256 = 'aa0eb8e0d3de0591be3da6cd6499a02641b43c235d766ea6c2210f5df80ebf38';
const [command, ...args] = process.argv.slice(2);
if (command === 'build') {
  const [previousCorpus, freshCorpus, output = '/tmp/arx6-extra-pass-replay.json'] = args;
  assert.ok(previousCorpus && freshCorpus, 'Usage: node extra-pass-replay.mjs build previous200.json fresh27.json [output.json]');
  assert.equal(hash(readFileSync(previousCorpus)), previousReplay.corpusSha256);
  assert.equal(hash(readFileSync(freshCorpus)), fresh.corpusSha256);
  const rows = [...read(previousCorpus), ...read(freshCorpus)];
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  const bytes = JSON.stringify(rows);
  assert.equal(hash(bytes), REPLAY_CORPUS_SHA256, 'Changed frozen 227-input replay corpus');
  writeFileSync(output, bytes);
  process.stdout.write(`${JSON.stringify({ output, samples: rows.length, corpusSha256: hash(bytes) }, null, 2)}\n`);
} else if (command === 'verify') {
  const [input, output = file('extra-pass-replay')] = args;
  assert.ok(input, 'Usage: node extra-pass-replay.mjs verify measured-report.json [verified-report.json]');
  const measured = read(input);
  assert.equal(measured.corpusSha256, REPLAY_CORPUS_SHA256, 'Report does not use the frozen 227-input replay corpus');
  const variant = measured.variants.find(variant => variant.label === 'integrated-g3');
  assert.ok(variant, 'Missing integrated-g3 measurement');
  assert.equal(variant.corpusSha256, REPLAY_CORPUS_SHA256, 'Variant does not use the frozen 227-input replay corpus');
  const rows = variant.rows;
  assert.equal(rows.length, 227);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.ok(rows.every(row => row.roundTrip));
  const map = new Map(rows.map(row => [row.id, row]));
  const frozenRows = fresh.variants.find(variant => variant.label === 'candidate-g3').rows;
  for (const previous of frozenRows) {
    const row = map.get(previous.id);
    assert.ok(row);
    for (const field of ['fragmentSha256', 'fragmentChars', 'markdownLinkChars', 'decodedJsonChars']) {
      assert.equal(row[field], previous[field], `Integrated g3 changed ${field}: ${row.id}`);
    }
  }
  const historicalNames = ['diagnostic', 'validation', 'natural', 'capacity', 'external'];
  const cohorts = historicalNames.map(name => ({ name, report: read(file(`consolidated-${name}`)), baseline: 'final', legacy: 'main' }));
  const timing = read(file('consolidated-timing-original'));
  cohorts.push({ name: 'timing-boundaries', report: { variants: timing.variants.map(variant => ({ ...variant,
    rows: variant.rows.filter(row => row.family.startsWith('timing-boundary-')) })) }, baseline: 'final', legacy: 'main' });
  cohorts.push({ name: 'fresh-reserved', report: fresh, baseline: 'baseline-g2', legacy: 'legacy-auto' });
  function compare(reference, preserveLegacyTies = false) {
    let wins = 0, ties = 0, identicalTies = 0, losses = 0, baselineTotal = 0, candidateTotal = 0;
    const regressions = [];
    for (const previous of reference) {
      const row = map.get(previous.id);
      assert.ok(row && previous.roundTrip);
      assert.equal(row.decodedJsonChars, previous.decodedJsonChars);
      baselineTotal += previous.markdownLinkChars;
      candidateTotal += row.markdownLinkChars;
      if (row.markdownLinkChars < previous.markdownLinkChars) wins++;
      else if (row.markdownLinkChars === previous.markdownLinkChars) {
        ties++;
        if (row.fragmentSha256 === previous.fragmentSha256) identicalTies++;
        if (preserveLegacyTies) assert.equal(row.fragmentSha256, previous.fragmentSha256, `Changed legacy tie: ${row.id}`);
      } else {
        losses++;
        regressions.push({ id: row.id, baseline: previous.markdownLinkChars, candidate: row.markdownLinkChars });
      }
    }
    if (preserveLegacyTies) assert.equal(losses, 0, 'Automatic selection regressed from the complete legacy pool');
    return { samples: reference.length, wins, ties, identicalTies, losses, baselineTotal, candidateTotal,
      savedPercent: 100 * (1 - candidateTotal / baselineTotal), regressions };
  }
  measured.integrationReadback = {
    exactFrozenCandidateWireMatches: frozenRows.length,
    allRoundTrips: rows.length,
    provenance: 'Old cohorts are diagnostic in this pass. Previous-g2 values for those cohorts come from their original measured source snapshots, whose wires were replayed exactly before this pass; the fresh reserved baseline is exact commit 5d82b9f. No timing claim is made from this concurrent correctness replay.',
    cohorts: Object.fromEntries(cohorts.map(cohort => {
      const baselineRows = cohort.report.variants.find(variant => variant.label === cohort.baseline).rows;
      const legacyRows = cohort.report.variants.find(variant => variant.label === cohort.legacy).rows;
      const pr121 = cohort.report.variants.find(variant => variant.label === 'pr121');
      const prototype = cohort.report.variants.find(variant => variant.label === 'pr117-prototype');
      return [cohort.name, { versusPreviousG2: compare(baselineRows), versusLegacyAuto: compare(legacyRows, true),
        ...(pr121 ? { versusPr121: compare(pr121.rows) } : {}),
        ...(prototype ? { versusPr117Prototype: {
          fullCohortComparable: prototype.rows.every(row => row.roundTrip),
          unavailableBaselineSamples: prototype.rows.filter(row => !row.roundTrip).length,
          comparisonOnSuccessfulBaselineRowsOnly: compare(prototype.rows.filter(row => row.roundTrip)),
        } } : {}),
        fits2000: baselineRows.filter(previous => map.get(previous.id).markdownLinkChars <= 2000).length,
        fits8192Markdown: baselineRows.filter(previous => map.get(previous.id).markdownLinkChars <= 8192).length,
        fits8192Fragment: baselineRows.filter(previous => map.get(previous.id).fragmentChars <= 8192).length }];
    })),
    sourceReports: [...historicalNames.map(name => `consolidated-${name}`), 'consolidated-timing-original', 'extra-pass-validation']
      .map(name => ({ file: `${name}.json`, sha256: hash(readFileSync(file(name))) })),
  };
  writeFileSync(output, `${JSON.stringify(measured, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, ...measured.integrationReadback }, null, 2)}\n`);
} else throw new Error('Expected build or verify');
