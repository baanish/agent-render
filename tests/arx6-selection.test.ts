import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeEnvelopeAsync, encodeEnvelopeSurfacesAsync } from "@/lib/payload/fragment";
import type { CandidateFragment } from "@/lib/payload/fragment-arx";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const builders = vi.hoisted(() => ({
  arx: vi.fn(), arx2: vi.fn(), arx3: vi.fn(), arx4: vi.fn(), arx5: vi.fn(), arx6: vi.fn(),
}));

vi.mock("@/lib/payload/fragment-arx", () => ({
  buildArxCandidates: builders.arx,
  buildArx2Candidates: builders.arx2,
  buildArx3Candidates: builders.arx3,
  buildArx4Candidates: builders.arx4,
  buildArx5Candidates: builders.arx5,
  buildArx6Candidates: builders.arx6,
}));

const envelope: PayloadEnvelope = {
  v: 1, codec: "plain", activeArtifactId: "a",
  artifacts: [{ id: "a", kind: "markdown", content: "An unfamiliar artifact." }],
};
const legacyPool = ["arx5", "arx2", "arx", "deflate", "lz", "plain"] as const;

function candidate(codec: "arx2" | "arx5" | "arx6", value: string): CandidateFragment {
  return { codec, value, packed: false, transportLength: value.length, urlSerializedLength: value.length };
}

describe("ARX6 portfolio contract", () => {
  beforeEach(() => {
    for (const builder of Object.values(builders)) builder.mockReset().mockResolvedValue([]);
  });

  it.each(["tie", "loss", "unavailable"] as const)("keeps the exact old winner on an ARX6 %s", async (outcome) => {
    builders.arx5.mockResolvedValue([candidate("arx5", "fshort")]);
    builders.arx2.mockResolvedValue([candidate("arx2", "blonger")]);
    builders.arx6.mockResolvedValue(outcome === "unavailable" ? [] : [candidate("arx6", outcome === "tie" ? "g2same" : "g2longer")]);

    const previous = await encodeEnvelopeAsync(envelope, { codecPriority: [...legacyPool] });
    expect(await encodeEnvelopeAsync(envelope)).toBe(previous);
    expect(await encodeEnvelopeSurfacesAsync(envelope)).toEqual({
      fragmentBody: previous, transportFragmentBody: previous,
    });
  });

  it("preserves the old pool's tie winner when a non-mixer codec was shortest", async () => {
    builders.arx5.mockResolvedValue([candidate("arx5", "flonger")]);
    builders.arx2.mockResolvedValue([candidate("arx2", "bshort")]);
    builders.arx6.mockResolvedValue([candidate("arx6", "g2same")]);
    expect(await encodeEnvelopeAsync(envelope)).toBe("bshort");
  });

  it("does not skip ARX5 merely because ARX6 fits the requested budget", async () => {
    builders.arx6.mockResolvedValue([candidate("arx6", "g2longer")]);
    builders.arx5.mockResolvedValue([candidate("arx5", "fshort")]);
    expect(await encodeEnvelopeAsync(envelope, {
      codecPriority: ["arx6", "arx5"], targetMaxFragmentLength: 1960,
    })).toBe("fshort");
    expect(builders.arx5).toHaveBeenCalledOnce();
  });

  it("selects ARX6 only on a strict improvement over every old candidate", async () => {
    builders.arx5.mockResolvedValue([candidate("arx5", "flonger")]);
    builders.arx2.mockResolvedValue([candidate("arx2", "bshort")]);
    builders.arx6.mockResolvedValue([candidate("arx6", "g2win")]);
    expect(await encodeEnvelopeAsync(envelope)).toBe("g2win");
  });

  it("keeps a legacy URL whose actual serialization beats the conservative escape estimate", async () => {
    builders.arx5.mockResolvedValue([{
      ...candidate("arx5", "f!!!!"), transportLength: 13, urlSerializedLength: 13,
    }]);
    builders.arx6.mockResolvedValue([candidate("arx6", "g2longer")]);
    const previous = await encodeEnvelopeAsync(envelope, { codecPriority: [...legacyPool] });
    expect(await encodeEnvelopeAsync(envelope)).toBe(previous);
    expect(await encodeEnvelopeSurfacesAsync(envelope)).toEqual({
      fragmentBody: previous, transportFragmentBody: previous,
    });
  });

  it("honors an explicit budget when a shorter legacy URL exceeds its transport allowance", async () => {
    builders.arx5.mockResolvedValue([{
      ...candidate("arx5", "f!!!!"), transportLength: 13, urlSerializedLength: 13,
    }]);
    builders.arx6.mockResolvedValue([candidate("arx6", "g2longer")]);
    const options = { targetMaxFragmentLength: 10 };

    expect(await encodeEnvelopeAsync(envelope, options)).toBe("g2longer");
    expect(await encodeEnvelopeAsync(envelope, { ...options, budgetByTransport: true })).toBe("g2longer");
    expect(await encodeEnvelopeSurfacesAsync(envelope, options)).toEqual({
      fragmentBody: "g2longer", transportFragmentBody: "g2longer",
    });
  });
});
