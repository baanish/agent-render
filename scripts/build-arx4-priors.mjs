#!/usr/bin/env node

/**
 * Regenerates `public/arx4-priors.json`, the curated per-kind priming corpora the arx4 context mixer
 * runs before a payload.
 *
 * The benched per-kind prior (docs/arx4-cm-bench.md) is `<dictionary slot text>\n<curated kind
 * corpus>` truncated to exactly 16384 bytes. The first 2203 bytes of that are the dictionary-derived
 * common prefix, which the codec already rebuilds at runtime, so the asset ships only the 14181-byte
 * kind-specific remainder.
 *
 * The curated text is extracted from the frozen source rather than copied. This script checks what it
 * can see locally (the prefix the codec rebuilds still heads the prior, and the prior re-encodes to
 * exactly PRIOR_BYTES) and prints each prior's sha256; tests/arx4-priors.test.ts pins those digests,
 * so a drift in the frozen script or the shipped dictionaries fails the suite instead of silently
 * changing the arx4 wire.
 *
 * Outputs:
 *   public/arx4-priors.json    : minified asset the viewer fetches
 *   public/arx4-priors.json.br : brotli-compressed variant, tried first on default loads
 *
 * Run: node scripts/build-arx4-priors.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const brotli = require("brotli-wasm");

const PRIORS_VERSION = 1;
const PRIOR_BYTES = 16 * 1024;
// The frozen benchmark script holding the curated corpus is maintainer-local research
// material and is not tracked in this repo; pass its path to regenerate the asset.
// Integrity does not depend on having it: tests/arx4-priors.test.ts pins the sha256 of
// every prior reassembled from the shipped asset.
const frozenSourcePath = process.argv[2];
if (!frozenSourcePath) {
  console.error(
    "usage: node scripts/build-arx4-priors.mjs <path-to-frozen-arx4-cm-determinism.mjs>",
  );
  process.exit(1);
}
const FROZEN_SOURCE = resolve(frozenSourcePath);
const SECTIONS_START = "const curatedMarkdownSections = [";
const SECTIONS_END = "\nconst curatedSections =";

function fail(message) {
  console.error(`build-arx4-priors: ${message}`);
  process.exit(1);
}

/**
 * Evaluates the three curated section arrays out of the frozen script. The slab between the markers
 * holds nothing but those array literals, and both markers are asserted so a reshaped frozen source
 * fails loudly rather than yielding a partial corpus.
 */
function extractCuratedSections() {
  const source = readFileSync(FROZEN_SOURCE, "utf8");
  const start = source.indexOf(SECTIONS_START);
  const end = source.indexOf(SECTIONS_END, start);
  if (start < 0 || end < 0) {
    fail(`could not locate the curated sections in ${FROZEN_SOURCE}`);
  }

  const slab = source.slice(start, end);
  const sections = new Function(
    `${slab}\nreturn { markdown: curatedMarkdownSections, code: curatedCodeSections, json: curatedJsonSections };`,
  )();

  for (const [kind, texts] of Object.entries(sections)) {
    if (!Array.isArray(texts) || texts.length === 0 || texts.some((text) => typeof text !== "string")) {
      fail(`extracted ${kind} sections are not a non-empty array of strings`);
    }
  }

  return sections;
}

function dictionarySlotText() {
  const base = JSON.parse(readFileSync(new URL("../public/arx-dictionary.json", import.meta.url), "utf8"));
  const overlay = JSON.parse(readFileSync(new URL("../public/arx2-dictionary.json", import.meta.url), "utf8"));
  return [
    ...base.singleByteSlots,
    ...base.extendedSlots,
    ...overlay.singleByteSlots,
    ...overlay.extendedSlots,
  ].join("\n");
}

/** The frozen `buildExactPrior`: dictionary text, a newline, the corpus, cut to exactly N bytes. */
function buildExactPrior(commonPrefix, corpusText, kind) {
  const available = Buffer.from(`${commonPrefix}${corpusText}`, "utf8");
  if (available.length < PRIOR_BYTES) {
    fail(`${kind} corpus has ${available.length} bytes, needs ${PRIOR_BYTES}`);
  }
  return available.subarray(0, PRIOR_BYTES).toString("utf8");
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const curatedSections = extractCuratedSections();
const commonPrefix = `${dictionarySlotText()}\n`;
const kinds = {};

for (const [kind, texts] of Object.entries(curatedSections)) {
  const frozenPrior = buildExactPrior(commonPrefix, texts.join("\n\n"), kind);
  // The prior is cut to PRIOR_BYTES, so dictionaries that outgrow that budget would ship a prior
  // whose head no longer matches the prefix the codec rebuilds from them at runtime.
  if (frozenPrior.slice(0, commonPrefix.length) !== commonPrefix) {
    fail(
      `${kind} prior head does not match the ${commonPrefix.length}-char dictionary-derived prefix; the shipped dictionaries no longer fit the ${PRIOR_BYTES}-byte prior`,
    );
  }

  const kindSpecific = frozenPrior.slice(commonPrefix.length);
  // A cut through a multibyte character would leave a replacement char that no longer re-encodes to
  // the priming bytes the bench measured, so the byte count is checked, not just the char count.
  if (Buffer.byteLength(frozenPrior, "utf8") !== PRIOR_BYTES) {
    fail(`${kind} prior re-encodes to ${Buffer.byteLength(frozenPrior, "utf8")} bytes, expected ${PRIOR_BYTES}`);
  }

  kinds[kind] = kindSpecific;
  console.log(`${kind}: prior ${frozenPrior.length} chars, kind block ${kindSpecific.length} chars, sha256 ${sha256(frozenPrior)}`);
}

const json = JSON.stringify({ version: PRIORS_VERSION, kinds });
const compressed = brotli.compress(Buffer.from(json, "utf8"), { quality: 11 });

writeFileSync(new URL("../public/arx4-priors.json", import.meta.url), json, "utf8");
writeFileSync(new URL("../public/arx4-priors.json.br", import.meta.url), compressed);

console.log(`public/arx4-priors.json: ${Buffer.byteLength(json, "utf8")} bytes`);
console.log(`public/arx4-priors.json.br: ${compressed.length} bytes (brotli q11)`);
console.log(`common prefix: ${commonPrefix.length} chars, derived from the shipped dictionaries`);
