import { sampleEnvelopes } from "@/lib/payload/examples";
import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

export const fixtureEnvelopes = sampleEnvelopes;

export function getEnvelopeByTitle(title: string): PayloadEnvelope {
  const envelope = fixtureEnvelopes.find((entry) => entry.title === title);
  if (!envelope) {
    throw new Error(`Missing fixture envelope titled "${title}".`);
  }

  return envelope;
}

export function getFragmentHash(title: string): string {
  return `#${encodeEnvelope(getEnvelopeByTitle(title))}`;
}

export const invalidFragments = {
  malformed: "#agent-render=v1.plain.bm90LWpzb24",
  wrongKey: "#not-agent-render=v1.plain.bm90LWpzb24",
};
