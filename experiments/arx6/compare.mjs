/** Reproducible cross-revision comparison. Each variant runs in a separate process. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, '../..');
const args = process.argv.slice(2);
const variants = [];
let corpusPath;
let outputPath;
let corpusDescription = 'Deterministically generated synthetic coverage. Diagnostic and reserved validation splits are separately hash-frozen; neither is independently collected real-world data.';
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--corpus') corpusPath = path.resolve(args[++index]);
  else if (arg === '--out') outputPath = path.resolve(args[++index]);
  else if (arg === '--description') corpusDescription = args[++index];
  else if (arg === '--variant') {
    const [label, ...rest] = args[++index].split('=');
    assert.ok(label && rest.length, 'Expected --variant label=/repository/path');
    variants.push({ label, root: path.resolve(rest.join('=')), mode: 'auto' });
  } else if (arg === '--codec-variant') {
    const [label, mode, ...rest] = args[++index].split('=');
    assert.ok(label && ['arx6', 'arx5'].includes(mode) && rest.length, 'Expected --codec-variant label=arx6|arx5=/repository/path');
    variants.push({ label, root: path.resolve(rest.join('=')), mode });
  } else if (arg === '--prototype') variants.push({ label: 'pr117-prototype', root: repo, mode: 'prototype' });
  else throw new Error(`Unknown argument ${arg}`);
}
if (!corpusPath || variants.length === 0 || !outputPath) throw new Error('Usage: node experiments/arx6/compare.mjs --corpus corpus.json --variant main=/snapshot/main --variant pr121=/snapshot/pr121 [--prototype] [--variant final=/snapshot/final] --out results.json');
assert.equal(new Set(variants.map(variant => variant.label)).size, variants.length, 'Variant labels must be unique');
mkdirSync(path.dirname(outputPath), { recursive: true });

function evaluate(variant) {
  const loader = path.join(variant.root, 'node_modules/tsx/dist/loader.mjs');
  assert.ok(existsSync(loader), `Install dependencies or link node_modules at ${variant.root}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', loader, path.join(directory, 'evaluate.mjs'), variant.root, corpusPath, variant.mode], {
      cwd: variant.root, env: { ...process.env, TSX_TSCONFIG_PATH: path.join(variant.root, 'tsconfig.json') }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout.on('data', data => { stdout += data.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) reject(new Error(`${variant.label} worker exited ${code}`));
      else {
        try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
      }
    });
  });
}

const measured = [];
for (const variant of variants) {
  const measurement = await evaluate(variant);
  measured.push({ label: variant.label, ...measurement });
  // Save each completed worker immediately so long comparisons are recoverable.
  writeFileSync(`${outputPath}.${variant.label}.json`, `${JSON.stringify(measured.at(-1), null, 2)}\n`);
}

function sum(rows, field) { return rows.reduce((total, row) => total + (row[field] ?? 0), 0); }
function percentile(rows, field, fraction) {
  const values = rows.map(row => row[field]).filter(value => typeof value === 'number').sort((a, b) => a - b);
  return values.length ? values[Math.min(values.length - 1, Math.floor(values.length * fraction))] : null;
}
function summarize(rows) {
  const valid = rows.filter(row => row.roundTrip === true);
  const counts = field => Object.fromEntries([...new Set(valid.map(row => row[field]).filter(Boolean))].map(value => [value, valid.filter(row => row[field] === value).length]));
  return { samples: rows.length, roundTrips: valid.length, failures: rows.filter(row => row.error).length,
    declined: rows.filter(row => row.declined).length, totalMarkdownLinkChars: sum(valid, 'markdownLinkChars'),
    codecTagCounts: counts('tag'), priorCounts: counts('prior'),
    fits2000: valid.filter(row => row.markdownLinkChars <= 2000).length,
    fits8192Markdown: valid.filter(row => row.markdownLinkChars <= 8192).length,
    fits8192Fragment: valid.filter(row => row.fragmentChars <= 8192).length,
    encodeMsTotal: sum(rows, 'encodeMs'), encodeMsP50: percentile(rows, 'encodeMs', 0.5), encodeMsP95: percentile(rows, 'encodeMs', 0.95),
    encodeMsMax: percentile(rows, 'encodeMs', 1),
    decodeMsP50: percentile(rows, 'decodeMs', 0.5), decodeMsP95: percentile(rows, 'decodeMs', 0.95), decodeMsMax: percentile(rows, 'decodeMs', 1) };
}
function paired(baseline, candidate) {
  assert.equal(baseline.length, candidate.length, 'Candidate and baseline row counts differ');
  const baseMap = new Map(baseline.map(row => [row.id, row]));
  assert.equal(baseMap.size, baseline.length, 'Duplicate baseline sample IDs');
  assert.equal(new Set(candidate.map(row => row.id)).size, candidate.length, 'Duplicate candidate sample IDs');
  let wins = 0, ties = 0, losses = 0, unavailable = 0, baselineUnavailable = 0, baselineTotal = 0, candidateTotal = 0, fallbackSelectedTotal = 0, identicalTies = 0;
  const regressions = [];
  for (const row of candidate) {
    const base = baseMap.get(row.id);
    assert.ok(base, `Missing baseline row ${row.id}`);
    if (!base.roundTrip) { baselineUnavailable++; continue; }
    baselineTotal += base.markdownLinkChars;
    if (!row.roundTrip) { unavailable++; fallbackSelectedTotal += base.markdownLinkChars; continue; }
    candidateTotal += row.markdownLinkChars;
    fallbackSelectedTotal += Math.min(base.markdownLinkChars, row.markdownLinkChars);
    if (row.markdownLinkChars < base.markdownLinkChars) wins++;
    else if (row.markdownLinkChars === base.markdownLinkChars) { ties++; if (row.fragmentSha256 === base.fragmentSha256) identicalTies++; }
    else { losses++; regressions.push({ id: row.id, baseline: base.markdownLinkChars, candidate: row.markdownLinkChars }); }
  }
  return { wins, ties, identicalTies, losses, unavailable, baselineUnavailable, baselineTotal,
    candidateTotal: unavailable ? null : candidateTotal,
    savedPercent: unavailable ? null : 100 * (1 - candidateTotal / baselineTotal),
    hypotheticalExactFallbackTotal: fallbackSelectedTotal,
    hypotheticalExactFallbackSavedPercent: 100 * (1 - fallbackSelectedTotal / baselineTotal), regressions };
}
const first = measured[0];
const corpusSha256 = createHash('sha256').update(readFileSync(corpusPath)).digest('hex');
const report = { corpusSha256, baseline: first.label,
  corpusDescription,
  measurement: 'Every character in the complete URL-serialized Markdown link is counted. Only exact normalized-envelope round trips count as successful. codec is transport metadata; all other schema fields and UTF-16 code units are compared.',
  summaries: Object.fromEntries(measured.map(variant => [variant.label, summarize(variant.rows)])),
  comparisons: Object.fromEntries(measured.slice(1).map(variant => [variant.label, paired(first.rows, variant.rows)])),
  pairwiseTotals: Object.fromEntries(measured.map(baseline => [baseline.label,
    Object.fromEntries(measured.filter(variant => variant !== baseline).map(variant => {
      const comparison = paired(baseline.rows, variant.rows);
      delete comparison.regressions;
      return [variant.label, comparison];
    }))])),
  byFamily: Object.fromEntries([...new Set(first.rows.map(row => row.family))].map(family => [family,
    Object.fromEntries(measured.map(variant => [variant.label, { ...summarize(variant.rows.filter(row => row.family === family)),
      ...(variant === first ? {} : paired(first.rows.filter(row => row.family === family), variant.rows.filter(row => row.family === family))) }]))])),
  variants: measured,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summaries: report.summaries, comparisons: report.comparisons }, null, 2)}\n`);
