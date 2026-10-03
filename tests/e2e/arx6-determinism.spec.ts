import path from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import base from "../../public/arx-dictionary.json";
import overlay from "../../public/arx2-dictionary.json";
import priors from "../../public/arx4-priors.json";
import { loadArxDictionarySync, loadArx2OverlayDictionarySync } from "@/lib/payload/arx-codec";
import { loadArx4PriorsSync, type Arx4PriorId } from "@/lib/payload/arx4-codec";
import { arx6CompressEnvelope, arx6DecompressEnvelope } from "@/lib/payload/arx6-codec";
import type { PayloadEnvelope } from "@/lib/payload/schema";
import { goToHash, waitForViewerState } from "./helpers";

declare global {
  interface Window {
    __arx6Determinism?: {
      load: () => Promise<number[]>;
      encode: (envelope: PayloadEnvelope, prior: Arx4PriorId) => string | null;
      decode: (payload: string) => PayloadEnvelope;
    };
  }
}

const root = path.resolve(__dirname, "../..");
const envelope: PayloadEnvelope = {
  v: 1, codec: "arx6", title: "Mixed UTF-16", activeArtifactId: "pair",
  artifacts: [
    { id: "notes", kind: "markdown", title: "A \ud800 title", content: '\uFEFF# Notes\r\n"quotes" \\path\n\u0000\ud800 / \udc00 / 😀 / 日本語\n' },
    { id: "code", kind: "code", language: "ts", content: "const words = ['alpha', 'beta'];\n" },
    { id: "pair", kind: "diff", oldContent: "old\n", newContent: "new\n", view: "split" },
  ],
};

let script: string;
test.beforeAll(async () => {
  loadArxDictionarySync(base);
  loadArx2OverlayDictionarySync(overlay);
  expect(loadArx4PriorsSync(priors)).toBe(1);
  const result = await build({
    stdin: {
      contents: `
        import { loadArxDictionary, loadArx2OverlayDictionary } from "@/lib/payload/arx-codec";
        import { loadArx4Priors } from "@/lib/payload/arx4-codec";
        import { arx6CompressEnvelope, arx6DecompressEnvelope } from "@/lib/payload/arx6-codec";
        window.__arx6Determinism = {
          load: async () => {
            const versions = await Promise.all([
              loadArxDictionary(new URL("arx-dictionary.json", location.href).href),
              loadArx2OverlayDictionary(new URL("arx2-dictionary.json", location.href).href),
            ]);
            return [...versions, await loadArx4Priors(new URL("arx4-priors.json", location.href).href)];
          },
          encode: arx6CompressEnvelope,
          decode: arx6DecompressEnvelope,
        };`,
      resolveDir: root, sourcefile: "arx6-browser-harness.ts", loader: "ts",
    },
    absWorkingDir: root, tsconfig: "tsconfig.json", bundle: true, format: "iife",
    platform: "browser", target: "es2020", external: ["brotli-wasm"], write: false,
  });
  script = result.outputFiles[0].text;
});

for (const prior of ["m", "c", "j", "s", "n"] as const) {
  test(`ARX6 v2 ${prior} is byte-identical to Node and preserves all UTF-16 code units`, async ({ page }) => {
    const expected = arx6CompressEnvelope(envelope, prior)!;
    expect(expected.startsWith(`2${prior}`)).toBe(true);
    expect(arx6DecompressEnvelope(expected)).toEqual(envelope);
    await goToHash(page);
    await waitForViewerState(page, "empty");
    await page.addScriptTag({ content: script });
    expect(await page.evaluate(() => window.__arx6Determinism!.load())).toEqual([1, 1, 1]);
    const result = await page.evaluate(({ value, priorId, wire }) => ({
      wire: window.__arx6Determinism!.encode(value, priorId),
      decoded: window.__arx6Determinism!.decode(wire),
    }), { value: envelope, priorId: prior, wire: expected });
    expect(result.wire).toBe(expected);
    expect(result.decoded).toEqual(envelope);
    const url = new URL(`https://agent-render.com/#g${expected}`);
    expect(url.hash).toBe(`#g${expected}`);
  });
}

test("the viewer rejects a truncated ARX6 v2 link", async ({ page }) => {
  const wire = arx6CompressEnvelope({
    v: 1, codec: "arx6", activeArtifactId: "a",
    artifacts: [{ id: "a", kind: "markdown", content: "# A complete artifact\n" }],
  })!;
  await goToHash(page, `#g${wire.slice(0, -1)}`);
  await waitForViewerState(page, "error");
  await expect(page.locator("[data-testid='renderer-markdown']")).toHaveCount(0);
});
