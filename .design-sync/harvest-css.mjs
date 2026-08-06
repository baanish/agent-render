// Harvests the Next build's compiled CSS into a stable cssEntry for design-sync.
// Next emits hashed filenames and absolute /_next/ font URLs, and sets the
// --font-* variables via generated classes on <html> that previews never get;
// this rewrites all three into .design-sync/.cache/ds-css/main.css.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const cssDir = join(repo, "out/_next/static/css");
const files = readdirSync(cssDir).filter((f) => f.endsWith(".css"));
if (files.length !== 1) throw new Error(`expected 1 compiled css, found: ${files.join(", ") || "none"} — run npm run build first`);

let css = readFileSync(join(cssDir, files[0]), "utf8");
css = css.replaceAll("url(/_next/static/media/", "url(../../../out/_next/static/media/");

const rootVars = [];
for (const m of css.matchAll(/\.__variable_[a-f0-9]+\{([^}]+)\}/g)) rootVars.push(m[1]);
if (rootVars.length === 0) throw new Error("no __variable_ font classes found in compiled css");

const outDir = join(repo, ".design-sync/.cache/ds-css");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "main.css"), `:root{${rootVars.join(";")}}\n` + css);
console.log(`harvested ${files[0]} -> .design-sync/.cache/ds-css/main.css (${rootVars.length} font vars lifted to :root)`);
