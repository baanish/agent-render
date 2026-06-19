import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sampleEnvelopes } from "@/lib/payload/examples";

/**
 * Characterization: the benchmark figures baked into the "arx showcase" prose
 * (the release-notes markdown table and the benchmarks.csv) are the corpus
 * totals produced by `npm run bench:codecs` and committed to
 * scripts/bench-baseline.json. This test recomputes the arx/arx2/arx3 brotli
 * byte and visible-char totals from that baseline and asserts the prose matches
 * them exactly, so the showcase numbers cannot silently drift from the codec.
 *
 * If this fails, the codec output changed — update the prose in examples.ts AND
 * these expected values together (regenerate via `npm run bench:codecs:update`).
 */

type Totals = { encodedBytes: number; visibleChars: number };

function corpusTotals(): Record<"arx" | "arx2" | "arx3", Totals> {
  const baseline = JSON.parse(
    readFileSync("scripts/bench-baseline.json", "utf8"),
  ) as { rows: Record<string, Totals> };

  const totals: Record<string, Totals> = {
    arx: { encodedBytes: 0, visibleChars: 0 },
    arx2: { encodedBytes: 0, visibleChars: 0 },
    arx3: { encodedBytes: 0, visibleChars: 0 },
  };

  for (const [id, row] of Object.entries(baseline.rows)) {
    const codec = id.slice(id.lastIndexOf(":") + 1);
    totals[codec].encodedBytes += row.encodedBytes;
    totals[codec].visibleChars += row.visibleChars;
  }

  return totals as Record<"arx" | "arx2" | "arx3", Totals>;
}

function showcaseArtifactContent(id: string): string {
  const showcase = sampleEnvelopes.find((envelope) => envelope.title === "arx showcase");
  if (!showcase) throw new Error("arx showcase envelope is missing");
  const artifact = showcase.artifacts.find((entry) => entry.id === id);
  if (!artifact || !("content" in artifact) || typeof artifact.content !== "string") {
    throw new Error(`arx showcase artifact "${id}" is missing string content`);
  }
  return artifact.content;
}

describe("arx showcase benchmark figures", () => {
  const totals = corpusTotals();
  const arx2ByteWin = ((totals.arx.encodedBytes - totals.arx2.encodedBytes) / totals.arx.encodedBytes) * 100;
  const arx3VisibleWin = ((totals.arx2.visibleChars - totals.arx3.visibleChars) / totals.arx2.visibleChars) * 100;

  it("recomputes the totals the committed baseline pins", () => {
    expect(totals).toEqual({
      arx: { encodedBytes: 5544, visibleChars: 7585 },
      arx2: { encodedBytes: 5410, visibleChars: 7416 },
      arx3: { encodedBytes: 5410, visibleChars: 2931 },
    });
    expect(arx2ByteWin.toFixed(2)).toBe("2.42");
    expect(arx3VisibleWin.toFixed(2)).toBe("60.48");
  });

  it("matches the figures cited in the release-notes markdown table", () => {
    const releaseNotes = showcaseArtifactContent("release-notes");

    expect(releaseNotes).toContain(
      `| arx | ${totals.arx.encodedBytes.toLocaleString("en-US")} | ${totals.arx.visibleChars.toLocaleString("en-US")} | baseline |`,
    );
    expect(releaseNotes).toContain(
      `| arx2 | ${totals.arx2.encodedBytes.toLocaleString("en-US")} | ${totals.arx2.visibleChars.toLocaleString("en-US")} | ${arx2ByteWin.toFixed(2)}% fewer bytes |`,
    );
    expect(releaseNotes).toContain(
      `| arx3 | ${totals.arx3.encodedBytes.toLocaleString("en-US")} | ${totals.arx3.visibleChars.toLocaleString("en-US")} | ${arx3VisibleWin.toFixed(2)}% fewer visible chars vs arx2 |`,
    );
  });

  it("matches the figures cited in the benchmarks.csv artifact", () => {
    const benchmarksCsv = showcaseArtifactContent("metrics");

    expect(benchmarksCsv).toContain(
      `arx,${totals.arx.encodedBytes},${totals.arx.visibleChars},baseline`,
    );
    expect(benchmarksCsv).toContain(
      `arx2,${totals.arx2.encodedBytes},${totals.arx2.visibleChars},${arx2ByteWin.toFixed(2)}% fewer bytes`,
    );
    expect(benchmarksCsv).toContain(
      `arx3,${totals.arx3.encodedBytes},${totals.arx3.visibleChars},${arx3VisibleWin.toFixed(2)}% fewer visible chars vs arx2`,
    );
  });
});
