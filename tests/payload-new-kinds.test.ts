import { describe, expect, it } from "vitest";

import { decodeFragment, encodeEnvelope, encodeEnvelopeAsync, decodeFragmentAsync } from "@/lib/payload/fragment";
import { isPayloadEnvelope, type PayloadEnvelope } from "@/lib/payload/schema";
import { packEnvelope, unpackEnvelope } from "@/lib/payload/wire-format";

const htmlEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Kit sample",
  activeArtifactId: "report",
  artifacts: [
    {
      id: "report",
      kind: "html",
      title: "Report",
      content: '<div class="ar-card"><p>Build passing</p></div>',
    },
  ],
};

describe("html envelope validation", () => {
  it("accepts an html artifact with content", () => {
    expect(isPayloadEnvelope(htmlEnvelope)).toBe(true);
  });

  it("rejects an html artifact without content", () => {
    const invalid = { ...htmlEnvelope, artifacts: [{ id: "x", kind: "html" }] };
    expect(isPayloadEnvelope(invalid)).toBe(false);
  });
});

describe("html wire transport", () => {
  it("round-trips through the packed wire format", () => {
    const unpacked = unpackEnvelope(JSON.parse(JSON.stringify(packEnvelope(htmlEnvelope))));
    expect(unpacked).toEqual(htmlEnvelope);
  });

  it("round-trips through sync fragment encoding", () => {
    const parsed = decodeFragment(encodeEnvelope(htmlEnvelope));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope.artifacts).toEqual(htmlEnvelope.artifacts);
    }
  });

  it("never selects a tuple codec (arx2/arx3/arx4) for html", async () => {
    const fragment = await encodeEnvelopeAsync(htmlEnvelope);
    const parsed = await decodeFragmentAsync(fragment);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(["arx2", "arx3", "arx4"]).not.toContain(parsed.envelope.codec);
      expect(parsed.envelope.artifacts).toEqual(htmlEnvelope.artifacts);
    }
  });
});
