/**
 * Synchronous SHA-256 (FIPS 180-4) over bytes.
 *
 * WebCrypto's `crypto.subtle.digest` is async and `node:crypto` is not available in the browser, while
 * the one place this is used (the arx4 priors identity check in arx4-codec.ts) installs an asset
 * synchronously and must reject a mismatch before any coder can reach it. tests/sha256.test.ts pins
 * this against `node:crypto` across the padding boundaries.
 */

const ROUND_CONSTANTS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL_HASH = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_BYTES = 64;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

/** SHA-256 digest of `bytes`, as lowercase hex. */
export function sha256Hex(bytes: Uint8Array): string {
  const blockCount = Math.floor((bytes.length + 8) / BLOCK_BYTES) + 1;
  const padded = new Uint8Array(blockCount * BLOCK_BYTES);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  // The trailing 64-bit big-endian bit length, split because a bit count over 2^32 does not fit a
  // 32-bit write (bytes / 2^29 is the high word of bytes * 8).
  view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0);

  const hash = Uint32Array.from(INITIAL_HASH);
  const schedule = new Uint32Array(64);

  for (let block = 0; block < blockCount; block += 1) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(block * BLOCK_BYTES + index * 4);
    }

    for (let index = 16; index < 64; index += 1) {
      const previous = schedule[index - 15];
      const recent = schedule[index - 2];
      const sigma0 = rotateRight(previous, 7) ^ rotateRight(previous, 18) ^ (previous >>> 3);
      const sigma1 = rotateRight(recent, 17) ^ rotateRight(recent, 19) ^ (recent >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + ROUND_CONSTANTS[index] + schedule[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    const working = [a, b, c, d, e, f, g, h];
    for (let index = 0; index < 8; index += 1) {
      hash[index] = (hash[index] + working[index]) >>> 0;
    }
  }

  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}
