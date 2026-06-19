#!/usr/bin/env node

/**
 * Prepares pre-compressed static assets that are served directly from `public/`.
 *
 * Outputs:
 *   public/arx-dictionary.json     — minified JSON (agents can fetch this directly)
 *   public/arx-dictionary.json.br  — brotli-compressed (CDN or agent can use this)
 *   public/arx2-dictionary.json    — minified overlay JSON
 *   public/arx2-dictionary.json.br — brotli-compressed overlay JSON
 *   public/vendor/diff-view-pure.css    — mirrored @git-diff-view stylesheet
 *   public/vendor/diff-view-pure.css.br — brotli-compressed stylesheet loaded by diffs
 *
 * Run: node scripts/compress-dictionary.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { dirname } from "path";

const require = createRequire(import.meta.url);
const brotli = require("brotli-wasm");

function writeCompressedTextAsset(path, contents) {
  const compressed = brotli.compress(Buffer.from(contents, "utf8"), { quality: 11 });

  writeFileSync(`${path}.br`, compressed);

  console.log(`${path}: ${contents.length} bytes`);
  console.log(`${path}.br: ${compressed.length} bytes (brotli q11)`);
  console.log(`Compression ratio: ${((1 - compressed.length / contents.length) * 100).toFixed(1)}%`);
}

function compressDictionary(path) {
  const source = JSON.parse(readFileSync(path, "utf8"));
  const minified = JSON.stringify(source);

  writeFileSync(path, minified, "utf8");
  writeCompressedTextAsset(path, minified);
}

function mirrorAndCompressTextAsset(sourcePath, targetPath) {
  const source = readFileSync(sourcePath, "utf8");

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, source, "utf8");
  writeCompressedTextAsset(targetPath, source);
}

compressDictionary("public/arx-dictionary.json");
compressDictionary("public/arx2-dictionary.json");
mirrorAndCompressTextAsset(
  "node_modules/@git-diff-view/react/styles/diff-view-pure.css",
  "public/vendor/diff-view-pure.css",
);
