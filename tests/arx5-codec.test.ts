import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arx4PriorsJson from "../public/arx4-priors.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { isBase64urlEncoded, isBaseBMPEncoded, loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import {
  arx4CompressEnvelope,
  arx5CompressEnvelope,
  arx5DecompressEnvelope,
  loadArx4PriorsSync,
} from "@/lib/payload/arx4-codec";
import { decodeFragmentAsync, encodeEnvelopeAsync, getFragmentTransportLength } from "@/lib/payload/fragment";
import { compactTagForCodec, codecs, type PayloadEnvelope } from "@/lib/payload/schema";

const ARX5_TAG = compactTagForCodec("arx5");

const reportEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Baanish Code Bench",
  activeArtifactId: "baanish-code-bench",
  artifacts: [
    {
      id: "baanish-code-bench",
      kind: "markdown",
      title: "Baanish Code Bench",
      filename: "results.md",
      content: readFileSync("tests/fixtures/baanish-code-bench-report.md", "utf8"),
    },
  ],
};

describe("arx5 codec", () => {
  beforeAll(() => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);
    loadArx4PriorsSync(arx4PriorsJson);
  });

  it("registers arx5 as a supported codec with compact tag f", () => {
    expect(codecs).toContain("arx5");
    expect(ARX5_TAG).toBe("f");
  });

  it("reuses arx4 mixer bytes and stamps the rebuilt envelope arx5", () => {
    const arx4Payloads = arx4CompressEnvelope({ ...reportEnvelope, codec: "arx4" });
    const arx5Payloads = arx5CompressEnvelope({ ...reportEnvelope, codec: "arx5" });

    expect(arx5Payloads.base64url).toBe(arx4Payloads.base64url);
    expect(arx5DecompressEnvelope(arx5Payloads.base64url)).toEqual({
      ...reportEnvelope,
      codec: "arx5",
    });
  });

  it("wins auto selection with an ASCII wire, not visible-length Unicode", async () => {
    const autoFragment = await encodeEnvelopeAsync(reportEnvelope);
    const arx2Fragment = await encodeEnvelopeAsync(reportEnvelope, { codec: "arx2" });
    const arx4Visible = await encodeEnvelopeAsync(reportEnvelope, { codec: "arx4" });

    expect(autoFragment.startsWith(ARX5_TAG)).toBe(true);
    expect(autoFragment).toMatch(/^[\x21-\x7e]+$/);
    expect(isBaseBMPEncoded(autoFragment.slice(2))).toBe(false);
    expect(isBase64urlEncoded(autoFragment.slice(2)) || autoFragment.includes("B.")).toBe(true);

    expect(getFragmentTransportLength(autoFragment)).toBeLessThan(getFragmentTransportLength(arx2Fragment));
    expect(getFragmentTransportLength(autoFragment)).toBeLessThan(getFragmentTransportLength(arx4Visible));

    const parsed = await decodeFragmentAsync(`#${autoFragment}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope).toEqual({ ...reportEnvelope, codec: "arx5" });
  });

  it("does not emit deprecated arx3 or arx4 from the default auto pool", async () => {
    const fragment = await encodeEnvelopeAsync(reportEnvelope);
    expect(fragment.startsWith(compactTagForCodec("arx3"))).toBe(false);
    expect(fragment.startsWith(compactTagForCodec("arx4"))).toBe(false);
    expect(fragment.startsWith(ARX5_TAG)).toBe(true);
  });

  it("still decodes existing arx4 fragments", async () => {
    const arx4Fragment = await encodeEnvelopeAsync(reportEnvelope, { codec: "arx4" });
    const parsed = await decodeFragmentAsync(`#${arx4Fragment}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope).toEqual({ ...reportEnvelope, codec: "arx4" });
  });
});
