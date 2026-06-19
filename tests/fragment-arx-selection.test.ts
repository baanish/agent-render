import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import arx2DictionaryJson from "../public/arx2-dictionary.json";
import arxDictionaryJson from "../public/arx-dictionary.json";
import { getActiveDictVersion, isBaseBMPEncoded, loadArx2OverlayDictionarySync, loadArxDictionarySync } from "@/lib/payload/arx-codec";
import { buildArx2Candidates, buildArx3Candidates } from "@/lib/payload/fragment-arx";
import { encodeEnvelopeAsync } from "@/lib/payload/fragment";
import { PAYLOAD_FRAGMENT_KEY, type PayloadEnvelope } from "@/lib/payload/schema";

// Mirror of fragment.ts `computeTransportLength` so the candidate pool here is measured with the
// exact metric production auto-selection uses. The arx3 baseBMP candidate intentionally opts out of
// this metric in favor of visible URL length (see the POLICY doc-comment on buildArx3Candidates).
function computeTransportLength(value: string): number {
  let len = 0;
  for (let i = 0; i < value.length; i++) {
    const cp = value.codePointAt(i)!;
    if (cp < 128) {
      const isChatSafeAscii =
        (cp >= 48 && cp <= 57) ||
        (cp >= 65 && cp <= 90) ||
        (cp >= 97 && cp <= 122) ||
        cp === 35 || // #
        cp === 45 || // -
        cp === 46 || // .
        cp === 61 || // =
        cp === 95 || // _
        cp === 126; // ~
      len += isChatSafeAscii ? 1 : 3;
    } else if (cp < 0x800) {
      len += 6;
    } else if (cp < 0x10000) {
      len += 9;
    } else {
      len += 12;
      i++;
    }
  }
  return len;
}

function getArx3PayloadBody(value: string): string {
  return value.split(`${PAYLOAD_FRAGMENT_KEY}=v1.arx3.${getActiveDictVersion()}.`)[1] ?? "";
}

describe("arx3-vs-arx2 selection policy", () => {
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

  // Characterization: if this fails after a refactor, that is intentional — update the values AND the
  // policy doc-comment in fragment-arx.ts together.
  it("selects arx3 baseBMP over arx2 by the visible-length budget, not a real byte-size difference", async () => {
    loadArxDictionarySync(arxDictionaryJson);
    loadArx2OverlayDictionarySync(arx2DictionaryJson);

    // Build the shared candidate pool with the same transport metric production auto-selection uses.
    const arx2Candidates = await buildArx2Candidates(reportEnvelope, computeTransportLength);
    const arx3Candidates = await buildArx3Candidates(reportEnvelope, computeTransportLength);
    const pool = [...arx2Candidates, ...arx3Candidates];

    // The global minimum (what selectCandidate returns in auto mode) is the arx3 baseBMP wire.
    const chosen = pool.reduce((best, candidate) =>
      candidate.transportLength < best.transportLength ? candidate : best,
    );

    expect(chosen.codec).toBe("arx3");
    expect(isBaseBMPEncoded(getArx3PayloadBody(chosen.value))).toBe(true);

    const minTransportLength = Math.min(...pool.map((candidate) => candidate.transportLength));
    expect(chosen.transportLength).toBe(minTransportLength);

    // The arx2 baseBMP payload is byte-identical work measured with percent-escaped transport length,
    // so its budget is far larger than the arx3 baseBMP visible-length budget that wins.
    const arx2BaseBMP = arx2Candidates.find((candidate) =>
      isBaseBMPEncoded(candidate.value.split(`${PAYLOAD_FRAGMENT_KEY}=v1.arx2.${getActiveDictVersion()}.`)[1] ?? ""),
    );
    expect(arx2BaseBMP).toBeDefined();
    expect(arx2BaseBMP!.transportLength).toBeGreaterThan(chosen.transportLength);

    // End-to-end: the public auto encoder commits to the same arx3 baseBMP wire.
    const fragment = await encodeEnvelopeAsync(reportEnvelope);
    expect(fragment).toContain(`v1.arx3.${getActiveDictVersion()}.`);
    expect(isBaseBMPEncoded(getArx3PayloadBody(fragment))).toBe(true);
  });
});
