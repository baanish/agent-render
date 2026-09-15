/** Byte corpora are pinned to the already-shipped ARX4/5 version-1 assets. */
export type Arx6PriorId = 'm' | 'c' | 'j';
export type Arx6Corpora = Readonly<Record<Arx6PriorId, Uint8Array>>;
/** Native tuples are validated by the existing application envelope/schema layer after decoding. */
export interface Arx6Codec {
  encode(tuple: unknown, priorId: Arx6PriorId): string | null;
  decode(fragment: string): unknown;
}
export interface LinkOptions { label?: string; baseUrl?: string; }
export function createArx6Codec(corpora: Arx6Corpora): Promise<Readonly<Arx6Codec>>;
export function crc32(bytes: Uint8Array): number;
export function formattedLink(fragment: string, options?: LinkOptions): string;
export function selectShorterFragment(legacy: string, candidate: string | null, options?: LinkOptions): string;
