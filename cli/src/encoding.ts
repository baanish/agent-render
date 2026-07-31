import arxDictionaryJson from "../../public/arx-dictionary.json";
import arx2DictionaryJson from "../../public/arx2-dictionary.json";
import arx4PriorsJson from "../../public/arx4-priors.json";
import {
  loadArx2OverlayDictionarySync,
  loadArxDictionarySync,
  type ArxDictionary,
} from "../../src/lib/payload/arx-codec";
import {
  loadArx4PriorsSync,
  type Arx4Priors,
} from "../../src/lib/payload/arx4-codec";
import {
  encodeEnvelopeSurfacesAsync,
  getVisibleFragmentLength,
} from "../../src/lib/payload/fragment";
import { MAX_FRAGMENT_LENGTH, type PayloadEnvelope } from "../../src/lib/payload/schema";

let codecsInitialized = false;

function initializeCodecs(): void {
  if (codecsInitialized) return;
  loadArxDictionarySync(arxDictionaryJson as ArxDictionary);
  loadArx2OverlayDictionarySync(arx2DictionaryJson as ArxDictionary);
  loadArx4PriorsSync(arx4PriorsJson as Arx4Priors);
  codecsInitialized = true;
}

export type EncodedEnvelope = {
  fragmentBody: string;
  transportFragmentBody: string;
};

/** Encodes an envelope with the full async codec ladder and embedded shipped codec assets. */
export async function encodePayloadEnvelope(envelope: PayloadEnvelope): Promise<EncodedEnvelope> {
  initializeCodecs();
  return encodeEnvelopeSurfacesAsync(envelope);
}

/** Joins a fragment body to a viewer base URL without percent-encoding its Unicode wire form. */
export function createFragmentUrl(baseUrl: string, fragmentBody: string): string {
  const base = new URL(baseUrl);
  base.hash = "";
  return `${base.toString()}#${fragmentBody}`;
}

/** Enforces the public fragment transport budget for a generated fragment. */
export function assertFragmentBudget(fragmentBody: string): void {
  const length = getVisibleFragmentLength(fragmentBody);
  if (length > MAX_FRAGMENT_LENGTH) {
    throw new Error(
      `This link needs ${length.toLocaleString()} fragment characters, which is over the ${MAX_FRAGMENT_LENGTH.toLocaleString()} character limit.`,
    );
  }
}
