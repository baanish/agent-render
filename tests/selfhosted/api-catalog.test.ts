import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("RFC 9727 api-catalog", () => {
  it("only advertises the optional self-hosted API description", () => {
    const catalogPath = path.resolve("public", ".well-known", "api-catalog");
    const raw = readFileSync(catalogPath, "utf8");
    const doc = JSON.parse(raw) as {
      linkset: Array<Record<string, unknown>>;
    };

    expect(Array.isArray(doc.linkset)).toBe(true);
    expect(doc.linkset.length).toBeGreaterThan(0);

    const entry = doc.linkset[0];
    expect(entry.anchor).toBe("/api/artifacts");
    expect(Object.keys(entry).sort()).toEqual(["anchor", "service-desc"]);

    const serviceDesc = entry["service-desc"] as Array<{ href: string; type: string }>;
    expect(serviceDesc).toEqual([
      {
        href: "/openapi/selfhosted-artifacts.yaml",
        type: "application/yaml",
      },
    ]);
  });
});
