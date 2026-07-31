import { describe, expect, it } from "vitest";

import { normalizeEnvelope } from "@/lib/payload/envelope";
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

const choicesEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  activeArtifactId: "next-steps",
  artifacts: [
    {
      id: "next-steps",
      kind: "choices",
      prompt: "Which fixes should land?",
      multi: true,
      options: [
        { id: "a", label: "Fix TTL", detail: "off by one hour" },
        { id: "b", label: "Document auth" },
      ],
    },
  ],
};

describe("html and choices envelope validation", () => {
  it("accepts an html artifact with content", () => {
    expect(isPayloadEnvelope(htmlEnvelope)).toBe(true);
  });

  it("rejects an html artifact without content", () => {
    const invalid = { ...htmlEnvelope, artifacts: [{ id: "x", kind: "html" }] };
    expect(isPayloadEnvelope(invalid)).toBe(false);
  });

  it("accepts a valid choices artifact", () => {
    expect(isPayloadEnvelope(choicesEnvelope)).toBe(true);
  });

  it("rejects choices with empty or malformed options", () => {
    const base = choicesEnvelope.artifacts[0];
    expect(isPayloadEnvelope({ ...choicesEnvelope, artifacts: [{ ...base, options: [] }] })).toBe(false);
    expect(
      isPayloadEnvelope({ ...choicesEnvelope, artifacts: [{ ...base, options: [{ id: 1, label: "x" }] }] }),
    ).toBe(false);
    expect(
      isPayloadEnvelope({ ...choicesEnvelope, artifacts: [{ ...base, multi: "yes" }] }),
    ).toBe(false);
  });

  it("rejects duplicate option ids in normalization", () => {
    const duplicated: PayloadEnvelope = {
      ...choicesEnvelope,
      artifacts: [
        {
          id: "next-steps",
          kind: "choices",
          options: [
            { id: "a", label: "one" },
            { id: "a", label: "two" },
          ],
        },
      ],
    };

    const result = normalizeEnvelope(duplicated);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('duplicate option id "a"');
    }
  });
});

describe("html and choices wire transport", () => {
  it("round-trips both kinds through the packed wire format", () => {
    for (const envelope of [htmlEnvelope, choicesEnvelope]) {
      const unpacked = unpackEnvelope(JSON.parse(JSON.stringify(packEnvelope(envelope))));
      expect(unpacked).toEqual(envelope);
    }
  });

  it("round-trips both kinds through sync fragment encoding", () => {
    for (const envelope of [htmlEnvelope, choicesEnvelope]) {
      const parsed = decodeFragment(encodeEnvelope(envelope));
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.envelope.artifacts).toEqual(envelope.artifacts);
      }
    }
  });

  it("never selects a tuple codec (arx2/arx3/arx4) for the new kinds", async () => {
    for (const envelope of [htmlEnvelope, choicesEnvelope]) {
      const fragment = await encodeEnvelopeAsync(envelope);
      const parsed = await decodeFragmentAsync(fragment);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(["arx2", "arx3", "arx4"]).not.toContain(parsed.envelope.codec);
        expect(parsed.envelope.artifacts).toEqual(envelope.artifacts);
      }
    }
  });
});
