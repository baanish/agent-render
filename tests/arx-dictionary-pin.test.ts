import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Defended contract — learned the hard way: real shared arx/arx2 links broke because a dictionary's
// content was changed while its `version` field stayed 1, so every previously-encoded fragment
// silently mis-decoded into garbage. The dictionary content and its version MUST move together.
//
// If you change a dictionary's slots, you MUST bump its `version` AND update the pinned hash here in
// the same commit. The version bump is the only thing that lets a future build distinguish (and
// reject, rather than garble) a fragment that was encoded with an older dictionary. Do NOT just
// re-pin the hash to make this test pass — that re-creates the silent-drift bug.
//
// arx3 reuses public/arx-dictionary.json (via arx3DecompressEnvelope), so pinning it also covers
// arx3; if arx3 is ever given its own dictionary file, add a pin entry for it here.
const PINNED: Record<string, { version: number; sha256: string }> = {
  "public/arx-dictionary.json": {
    version: 1,
    sha256: "16fe3f72dd5d282fd2f0271647a56c38c4b7eebb6e4723da670765f7d90380a9",
  },
  "public/arx2-dictionary.json": {
    version: 1,
    sha256: "12d0166fda16ce9697831805d92af0f558b4fad5a882c471ba072118561a74eb",
  },
};

describe("arx dictionary content is pinned to its version", () => {
  for (const [file, pin] of Object.entries(PINNED)) {
    it(`${file} matches its pinned version and content hash`, () => {
      const obj = JSON.parse(readFileSync(file, "utf8"));
      // Hash the canonical (re-serialized) form so whitespace/formatting changes don't trip it, only
      // real content changes (slots, version) do.
      const canonicalSha256 = createHash("sha256").update(JSON.stringify(obj)).digest("hex");

      expect(obj.version).toBe(pin.version);
      expect(canonicalSha256).toBe(pin.sha256);
    });
  }
});
