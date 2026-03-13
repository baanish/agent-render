#!/usr/bin/env node

/**
 * Pre-compresses public/arx-dictionary.json into minified and brotli-compressed variants.
 *
 * Outputs:
 *   public/arx-dictionary.json     — minified JSON (agents can fetch this directly)
 *   public/arx-dictionary.json.br  — brotli-compressed (CDN or agent can use this)
 *
 * Run: node scripts/compress-dictionary.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const brotli = require("brotli-wasm");

const src = JSON.parse(readFileSync("public/arx-dictionary.json", "utf8"));

// Re-serialize minified (no whitespace)
const minified = JSON.stringify(src);
writeFileSync("public/arx-dictionary.json", minified, "utf8");

// Brotli-compress the minified JSON
const compressed = brotli.compress(Buffer.from(minified, "utf8"), { quality: 11 });
writeFileSync("public/arx-dictionary.json.br", compressed);

console.log(`arx-dictionary.json: ${minified.length} bytes (minified)`);
console.log(`arx-dictionary.json.br: ${compressed.length} bytes (brotli q11)`);
console.log(`Compression ratio: ${((1 - compressed.length / minified.length) * 100).toFixed(1)}%`);
