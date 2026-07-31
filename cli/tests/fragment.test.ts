import { describe, expect, it } from "vitest";
import { decodeFragmentAsync } from "../../src/lib/payload/fragment";
import { buildPayloadEnvelope } from "../src/envelope";
import { MAX_DECODED_PAYLOAD_LENGTH } from "../../src/lib/payload/schema";
import {
  assertEnvelopeWithinBudget,
  assertFragmentBudget,
  createFragmentUrl,
  encodePayloadEnvelope,
} from "../src/encoding";

describe("fragment mode", () => {
  it("creates a decodable fragment URL for a small markdown artifact", async () => {
    const envelope = buildPayloadEnvelope(
      [{ filename: "sample.md", content: "# Hello\n\nFrom the CLI.\n" }],
      "auto",
      "CLI sample",
    );
    const encoded = await encodePayloadEnvelope(envelope);

    assertFragmentBudget(encoded.fragmentBody);
    const url = createFragmentUrl("https://agent-render.com/", encoded.fragmentBody);
    const decoded = await decodeFragmentAsync(new URL(url).hash);

    expect(url).toMatch(/^https:\/\/agent-render\.com\/#[pldabce]/u);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.envelope.title).toBe("CLI sample");
      expect(decoded.envelope.artifacts[0]).toMatchObject({
        kind: "markdown",
        content: "# Hello\n\nFrom the CLI.\n",
      });
    }
  });

  it("rejects an envelope over the decoded payload budget before encoding", () => {
    const envelope = buildPayloadEnvelope(
      [{ filename: "big.md", content: "x".repeat(MAX_DECODED_PAYLOAD_LENGTH + 1) }],
      "auto",
    );
    expect(() => assertEnvelopeWithinBudget(envelope)).toThrow(/payload limit/);
  });
});
