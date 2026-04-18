import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

/**
 * Writes RFC 9728 OAuth Protected Resource Metadata next to the static export.
 * See https://www.rfc-editor.org/rfc/rfc9728
 */
const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const basePath = configuredBasePath === "/" ? "" : configuredBasePath.replace(/\/$/, "");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://agent-render.com").replace(/\/$/, "");

const resource = basePath ? `${siteUrl}${basePath}` : siteUrl;

const metadata = {
  resource,
  authorization_servers: [],
  scopes_supported: [],
};

const body = `${JSON.stringify(metadata, null, 2)}\n`;
const outDir = path.resolve("out");

async function writeMetadata(relativeWellKnownDir) {
  const dir = path.join(outDir, ...relativeWellKnownDir.split("/").filter(Boolean), ".well-known");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "oauth-protected-resource"), body, "utf8");
}

await writeMetadata("");
if (basePath) {
  await writeMetadata(basePath);
}

console.log(`Wrote OAuth Protected Resource Metadata for resource: ${resource}`);
