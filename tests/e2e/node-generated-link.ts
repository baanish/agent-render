import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import type { GeneratedArtifactLink, LinkCreatorDraft } from "@/lib/payload/link-creator";

/**
 * Playwright's Node runner compiles the importing spec, but a runtime `import()` of another
 * TypeScript module (the deferred ARX stack in fragment.ts) is loaded as raw ESM and throws
 * `Cannot use import statement outside a module`. Bundle the encoder once so Node encode in this
 * spec matches the app without going through that loader gap.
 */
const NODE_ENCODER_ENTRY = `
import arx2DictionaryJson from "./public/arx2-dictionary.json";
import arx4PriorsJson from "./public/arx4-priors.json";
import arxDictionaryJson from "./public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "./src/lib/payload/arx-codec";
import { loadArx4PriorsSync } from "./src/lib/payload/arx4-codec";
import { createGeneratedArtifactLinkAsync } from "./src/lib/payload/link-creator";

loadArxDictionarySync(arxDictionaryJson);
loadArx2OverlayDictionarySync(arx2DictionaryJson);
loadArx4PriorsSync(arx4PriorsJson);

export { createGeneratedArtifactLinkAsync };
`;

const repositoryRoot = path.resolve(__dirname, "../..");

type NodeLinkEncoder = {
  createGeneratedArtifactLinkAsync: (
    draft: LinkCreatorDraft,
    baseUrl?: string,
  ) => Promise<GeneratedArtifactLink>;
};

let encoderPromise: Promise<NodeLinkEncoder> | null = null;

function loadNodeLinkEncoder(): Promise<NodeLinkEncoder> {
  encoderPromise ??= build({
    stdin: {
      contents: NODE_ENCODER_ENTRY,
      resolveDir: repositoryRoot,
      sourcefile: "node-generated-link-entry.ts",
      loader: "ts",
    },
    absWorkingDir: repositoryRoot,
    tsconfig: "tsconfig.json",
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    // Keep the encoder under the repo so leftover externals still resolve node_modules.
    // brotli-wasm stays external: mixer codecs do not load it.
    external: ["brotli-wasm"],
    write: false,
  }).then(async (result) => {
    const outDir = path.join(repositoryRoot, "test-results");
    mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, "node-generated-link-encoder.mjs");
    writeFileSync(outFile, result.outputFiles[0].text);
    return import(pathToFileURL(outFile).href) as Promise<NodeLinkEncoder>;
  });

  return encoderPromise;
}

/** Encodes a creator draft in Node through the same modules the app uses. */
export async function createNodeGeneratedArtifactLink(
  draft: LinkCreatorDraft,
  baseUrl?: string,
): Promise<GeneratedArtifactLink> {
  const encoder = await loadNodeLinkEncoder();
  return encoder.createGeneratedArtifactLinkAsync(draft, baseUrl);
}
