// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

type ReplayReport = {
  corpusSha256?: string;
  variants: {
    label: string;
    corpusSha256?: string;
    rows: { id: string; decodedJsonChars: number; fragmentChars: number; markdownLinkChars: number }[];
  }[];
  integrationReadback: unknown;
};

const script = fileURLToPath(new URL("../experiments/arx6/extra-pass-replay.mjs", import.meta.url));
const fixture = readFileSync(new URL("../experiments/arx6/results/extra-pass-replay.json", import.meta.url), "utf8");
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function verify(report: ReplayReport) {
  const directory = mkdtempSync(path.join(tmpdir(), "arx6-replay-test-"));
  directories.push(directory);
  const input = path.join(directory, "input.json");
  const output = path.join(directory, "verified.json");
  writeFileSync(input, JSON.stringify(report));
  const result = spawnSync(process.execPath, [script, "verify", input, output], { encoding: "utf8" });
  return { ...result, output };
}

describe("ARX6 integration replay provenance", () => {
  it("reproduces the archived comparisons for the frozen corpus", () => {
    const report = JSON.parse(fixture) as ReplayReport;
    const result = verify(report);
    expect(result.status, result.stderr).toBe(0);
    const verified = JSON.parse(readFileSync(result.output, "utf8")) as ReplayReport;
    expect(verified.integrationReadback).toEqual(report.integrationReadback);
  });

  it.each(["changed", "missing"])("rejects a %s corpus digest despite matching historical IDs and decoded lengths", (digest) => {
    const report = JSON.parse(fixture) as ReplayReport;
    const variant = report.variants.find(variant => variant.label === "integrated-g3")!;
    // A different body with the same decoded length can appear to improve an old row.
    // IDs, lengths, and successful round trips cannot establish corpus identity.
    const row = variant.rows[0];
    row.fragmentChars--;
    row.markdownLinkChars--;
    if (digest === "missing") delete report.corpusSha256;
    else report.corpusSha256 = "0".repeat(64);
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Report does not use the frozen 227-input replay corpus");
    expect(existsSync(result.output)).toBe(false);
  });

  it("rejects a variant from another corpus even if the report claims the frozen corpus", () => {
    const report = JSON.parse(fixture) as ReplayReport;
    report.variants.find(variant => variant.label === "integrated-g3")!.corpusSha256 = "0".repeat(64);
    const result = verify(report);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Variant does not use the frozen 227-input replay corpus");
    expect(existsSync(result.output)).toBe(false);
  });
});
