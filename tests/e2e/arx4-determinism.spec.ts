import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { arx4DeterminismVectors, arx4VectorEnvelope } from "../fixtures/arx4-vectors";
import { goToHash, waitForRendererReady, waitForViewerState } from "./helpers";
import arx2DictionaryJson from "../../public/arx2-dictionary.json";
import arx4PriorsJson from "../../public/arx4-priors.json";
import arxDictionaryJson from "../../public/arx-dictionary.json";
import { loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync, type Arx4PriorId } from "@/lib/payload/arx4-codec";
import { createGeneratedArtifactLinkAsync, type LinkCreatorDraft } from "@/lib/payload/link-creator";
import { compactTagForCodec, type PayloadEnvelope } from "@/lib/payload/schema";

/**
 * Release gate for the arx4 wire format: a browser that codes even one bit differently from Node
 * silently corrupts every arx4 link already shared, so the pinned vectors in
 * tests/fixtures/arx4-vectors.ts are asserted character for character in Chromium and WebKit too,
 * not only in the Node suite.
 *
 * Two layers, because no shipped export reaches the codec directly:
 * 1. The pinned vectors run against the codec source bundled into the page, which is the only way to
 *    pick a prior id explicitly (the app always derives it from the artifact kind).
 * 2. The link creator and the viewer exercise the same codec inside the real minified app bundle,
 *    where encode is compared against Node's own output for the same draft and the artifact content
 *    is read back through the app's copy action.
 */

const ARX4_TAG = compactTagForCodec("arx4");

declare global {
  interface Window {
    __arx4Determinism?: {
      loadPriorAssets: () => Promise<[number, number, number]>;
      encodeBase64url: (envelope: PayloadEnvelope, priorId: Arx4PriorId) => string;
    };
  }
}

/**
 * Entry point for the in-page harness. It pulls the same modules the app imports, and loads the
 * dictionaries and the curated priors from the served assets so the coder is primed from the shipped
 * corpus rather than a copy handed in from Node.
 */
const HARNESS_ENTRY = `
import { loadArx2OverlayDictionary, loadArxDictionary } from "@/lib/payload/arx-codec";
import { arx4CompressEnvelope, loadArx4Priors } from "@/lib/payload/arx4-codec";

window.__arx4Determinism = {
  loadPriorAssets: () => Promise.all([
    loadArxDictionary(new URL("arx-dictionary.json", window.location.href).toString()),
    loadArx2OverlayDictionary(new URL("arx2-dictionary.json", window.location.href).toString()),
    loadArx4Priors(new URL("arx4-priors.json", window.location.href).toString()),
  ]),
  encodeBase64url: (envelope, priorId) => arx4CompressEnvelope(envelope, priorId).base64url,
};
`;

const repositoryRoot = path.resolve(__dirname, "../..");
let harnessBundle: Promise<string> | null = null;

function bundleCodecForBrowser(): Promise<string> {
  harnessBundle ??= build({
    stdin: { contents: HARNESS_ENTRY, resolveDir: repositoryRoot, sourcefile: "arx4-harness.ts", loader: "ts" },
    absWorkingDir: repositoryRoot,
    tsconfig: "tsconfig.json",
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    // Only the Brotli codecs reach it, and a browser bundle of the wasm module is not needed here.
    external: ["brotli-wasm"],
    write: false,
  }).then((result) => result.outputFiles[0].text);

  return harnessBundle;
}

async function installCodecHarness(page: Page) {
  await page.addScriptTag({ content: await bundleCodecForBrowser() });

  // A failed dictionary fetch silently falls back to the built-in dictionary (version 0), and failed
  // priors downgrade every kind id to `s`; both code different bytes and would read as a determinism
  // failure, so pin the loaded versions.
  const versions = await page.evaluate(() => window.__arx4Determinism!.loadPriorAssets());
  expect(versions).toEqual([1, 1, 1]);
}

async function fillCreatorDraft(page: Page, draft: LinkCreatorDraft) {
  await page.getByRole("button", { name: draft.kind, exact: true }).click();
  await page.getByLabel("Title").fill(draft.title);
  await page.getByLabel("Filename").fill(draft.filename);
  if (draft.kind === "code") {
    await page.getByRole("textbox", { name: "Language", exact: true }).fill(draft.language);
  }
  await page.getByRole("textbox", { name: /^Content\b/ }).fill(draft.content);
  await page.getByRole("button", { name: "arx4", exact: true }).click();
}

/** Reads the artifact body the viewer decoded, through the app's own copy action. */
async function copyArtifactBody(page: Page): Promise<string | null> {
  await page.evaluate(() => {
    window.localStorage.removeItem("copied-artifact-body");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (value: string) => {
          window.localStorage.setItem("copied-artifact-body", value);
          return Promise.resolve();
        },
      },
    });
  });

  await page.getByRole("button", { name: "Copy", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "Copied" }).first()).toBeVisible();
  return page.evaluate(() => window.localStorage.getItem("copied-artifact-body"));
}

const creatorDrafts: LinkCreatorDraft[] = [
  {
    kind: "markdown",
    title: "Release notes",
    filename: "notes.md",
    content: "# Release notes\n\n- Ship the arx4 codec\n- Keep fragments copyable\n\n| Surface | State |\n| --- | --- |\n| viewer | ready |\n| creator | ready |\n",
    language: "",
    diffView: "unified",
    codec: "arx4",
  },
  {
    kind: "code",
    title: "Wire selection",
    filename: "wire.ts",
    content: "export function selectWire(candidates: Candidate[]): Candidate {\n  return candidates.reduce((best, candidate) => (candidate.length < best.length ? candidate : best));\n}\n",
    language: "ts",
    diffView: "unified",
    codec: "arx4",
  },
  {
    kind: "json",
    title: "Manifest",
    filename: "manifest.json",
    content: "{\n  \"codec\": \"arx4\",\n  \"wire\": [\"base76\", \"base1k\", \"baseBMP\", \"base64url\"],\n  \"priors\": 5\n}\n",
    language: "",
    diffView: "unified",
    codec: "arx4",
  },
];

test.beforeAll(() => {
  // The Node side of this spec encodes too, and an unloaded asset would fall back (built-in
  // dictionary, `s` prior) and produce different bytes than the browser reads from the served files.
  expect(loadArxDictionarySync(arxDictionaryJson)).toBe(1);
  expect(loadArx2OverlayDictionarySync(arx2DictionaryJson)).toBe(1);
  expect(loadArx4PriorsSync(arx4PriorsJson)).toBe(1);
});

test.describe("arx4 pinned vectors in the browser", () => {
  for (const [priorId, content, expected] of arx4DeterminismVectors) {
    test(`encodes the ${priorId} prior vector to the pinned payload`, async ({ page }) => {
      await goToHash(page);
      await waitForViewerState(page, "empty");
      await installCodecHarness(page);

      const produced = await page.evaluate(
        (vector) => window.__arx4Determinism!.encodeBase64url(vector.envelope, vector.priorId),
        { envelope: arx4VectorEnvelope(content), priorId },
      );

      expect(produced).toBe(expected);
    });

    test(`round-trips the pinned ${priorId} prior fragment through the viewer`, async ({ page }) => {
      await goToHash(page, `#${ARX4_TAG}${expected}`);
      await waitForViewerState(page, "artifact");
      await waitForRendererReady(page, "markdown");

      expect(await copyArtifactBody(page)).toBe(content);
    });
  }
});

test.describe("arx4 links from the shipped app bundle", () => {
  for (const draft of creatorDrafts) {
    test(`generates and previews the Node-identical arx4 link for a ${draft.kind} draft`, async ({ page }) => {
      await goToHash(page);
      await waitForViewerState(page, "empty");
      await fillCreatorDraft(page, draft);
      await page.getByRole("button", { name: "Generate link" }).click();

      const generatedLink = page.getByLabel("Generated agent-render link");
      await expect(generatedLink).toBeVisible();
      // The creator encodes against `location.href` with the fragment stripped, so Node has to
      // build its comparison URL from the same base.
      const baseUrl = await page.evaluate(() => {
        const url = new URL(window.location.href);
        url.hash = "";
        return url.toString();
      });
      const nodeLink = await createGeneratedArtifactLinkAsync(draft, baseUrl);

      expect(nodeLink.codec).toBe("arx4");
      expect(await generatedLink.inputValue()).toBe(nodeLink.url);

      await page.getByRole("button", { name: "Preview here" }).click();
      await waitForViewerState(page, "artifact");
      await waitForRendererReady(page, draft.kind);

      expect(await copyArtifactBody(page)).toBe(draft.content);
    });
  }
});
