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
      encode: (envelope: PayloadEnvelope, prior: Arx4PriorId, version?: 2 | 3) => string | null;
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

/** Frozen g3 vectors: model or framing changes must use a new version. */
const v3Vectors: Record<Arx4PriorId, string> = {
  "m": "3mshP0qAf.J5osFdRy3Wgb_iRxouAfiX3Ma~EfJ~scE37GeCnRhM1Uj2NLdAqrI~Xbl6x_bQOk8c-l_NOPURqVvzPtu2_E9XECt0ipzi1nSlfhP_Yzk86iYdnIZdk.jrEgxv4KBm9Hpwk94fgdEW-jhL_6vuwZ0yzjsvp8E3qBuVqeO4a8.e",
  "c": "3cshP0qAivy11x4Ba7q3sM1EvKdyF2nVHrlQ8ugx-xKvK_4PfdknA1Y00IApn_yKSJ7Ggzc4_u3bRSCe.O6PLtOKOUlB.64zprpZWNchHbafaBnnbhS-9FtSza4x~l~Tm3A.x1NqLF5skEJZmZ1FBch06tkSxTEexfKxIPCkc",
  "j": "3jshP0qAflw.YUSvkn7T4KKuxFHNBQBYXc03r7JrMXpG~yOoOoPKRBZAbeySsSQNPRguo2XWFg7O.Xt-7b-mQYNthecpJR1DTTQNUREm.T_R2.I3Fmm4OoMAYNpDGLZokWLmfDidl9bl87XOsidU5b.GRlVlz2Pxhp5o70qvT7IVrWiELGOk",
  "s": "3sshP0qAkymTzX4GuLyAoj8oe8hzhupz~PIhve4KX_hTxlUo0Fk.__wbxjj8GmfUlsIJhmb7Qsj3O8l2K7Wz-9Xr-zmxi~VqVPUTALj0-9W~AkSoH7CiQu8WwHbuO6QsKsAU02W3x8jwhd4cdH7811353uIRMFw4RQMzDiE_8TJx4dc4oCL8phKRC",
  "n": "3nshPJT1jL5WcXGx_-IJYYP5SiEDDzHGmnI65PSWH7B9PxjxOjUTIEpKKPirZ9FB.f98vBa.t8Y4DsTKrHZbYqwOeN9JjGmuj0c~Bh52HNaDA~gpCZtSO.3uxqDKm9AMsuxctfEIwK_AlbBP.bL_1am84a_OdcbM74EAJ9kFXBz5rwTz0-5C0a6p1PDrxC53Ge_e7syFvHzgdX6UF6YBryWhJToPXZ"
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

for (const version of [2, 3] as const) {
  for (const prior of ["m", "c", "j", "s", "n"] as const) {
    test(`ARX6 v${version} ${prior} is byte-identical to Node and preserves all UTF-16 code units`, async ({ page }) => {
      const expected = arx6CompressEnvelope(envelope, prior, version)!;
      expect(expected.startsWith(`${version}${prior}`)).toBe(true);
      if (version === 3) expect(expected).toBe(v3Vectors[prior]);
      expect(arx6DecompressEnvelope(expected)).toEqual(envelope);
      await goToHash(page);
      await waitForViewerState(page, "empty");
      await page.addScriptTag({ content: script });
      expect(await page.evaluate(() => window.__arx6Determinism!.load())).toEqual([1, 1, 1]);
      const result = await page.evaluate(({ value, priorId, wire, modelVersion }) => ({
        wire: window.__arx6Determinism!.encode(value, priorId, modelVersion),
        decoded: window.__arx6Determinism!.decode(wire),
      }), { value: envelope, priorId: prior, wire: expected, modelVersion: version });
      expect(result.wire).toBe(expected);
      expect(result.decoded).toEqual(envelope);
      const url = new URL(`https://agent-render.com/#g${expected}`);
      expect(url.hash).toBe(`#g${expected}`);
    });
  }
}

for (const version of [2, 3] as const) {
  test(`the viewer rejects a truncated ARX6 v${version} link`, async ({ page }) => {
    const wire = arx6CompressEnvelope({
      v: 1, codec: "arx6", activeArtifactId: "a",
      artifacts: [{ id: "a", kind: "markdown", content: "# A complete artifact\n" }],
    }, undefined, version)!;
    await goToHash(page, `#g${wire.slice(0, -1)}`);
    await waitForViewerState(page, "error");
    await expect(page.locator("[data-testid='renderer-markdown']")).toHaveCount(0);
  });
}
