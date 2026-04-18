import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildAgentRenderLinkHeaderValue } from "./agent-render-link-headers.mjs";

const outputDirectory = path.resolve("out");
const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const linkHeaderValue = buildAgentRenderLinkHeaderValue(configuredBasePath);

if (!existsSync(outputDirectory)) {
  console.error("Missing `out/`. Run `next build` first.");
  process.exit(1);
}

const wellKnownDir = path.join(outputDirectory, ".well-known");
const docsOutDir = path.join(outputDirectory, "docs");

mkdirSync(wellKnownDir, { recursive: true });
mkdirSync(docsOutDir, { recursive: true });

const apiCatalogOut = path.join(wellKnownDir, "api-catalog.json");
if (existsSync(apiCatalogOut)) {
  copyFileSync(apiCatalogOut, path.join(docsOutDir, "openapi.json"));
}

const repoRoot = path.resolve(".");

for (const relative of ["README.md", path.join("docs", "payload-format.md")]) {
  const src = path.join(repoRoot, relative);
  const dest = path.join(outputDirectory, relative);
  if (existsSync(src)) {
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
}

/** Cloudflare Pages `_headers` and compatible static host header files */
function buildHeadersFile() {
  const lines = [];

  const addBlock = (urlPath) => {
    lines.push(urlPath);
    lines.push(`  Link: ${linkHeaderValue}`);
    lines.push("");
  };

  addBlock("/");
  addBlock("/index.html");

  const baseSegment = configuredBasePath === "/" ? "" : configuredBasePath.replace(/^\/+|\/+$/g, "");
  if (baseSegment) {
    addBlock(`/${baseSegment}`);
    addBlock(`/${baseSegment}/`);
    addBlock(`/${baseSegment}/index.html`);
  }

  return lines.join("\n");
}

writeFileSync(path.join(outputDirectory, "_headers"), buildHeadersFile(), "utf-8");
console.log("Agent discovery: copied docs, openapi alias, and wrote out/_headers with Link.");
