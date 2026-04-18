import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("RFC 9727 api-catalog", () => {
  it("has linkset entries with anchor, service-desc, service-doc, and status", () => {
    const catalogPath = path.resolve("public", ".well-known", "api-catalog");
    const raw = readFileSync(catalogPath, "utf8");
    const doc = JSON.parse(raw) as {
      linkset: Array<Record<string, unknown>>;
    };

    expect(Array.isArray(doc.linkset)).toBe(true);
    expect(doc.linkset.length).toBeGreaterThan(0);

    const entry = doc.linkset[0];
    expect(typeof entry.anchor).toBe("string");
    expect(Array.isArray(entry["service-desc"])).toBe(true);
    expect(Array.isArray(entry["service-doc"])).toBe(true);
    expect(Array.isArray(entry.status)).toBe(true);

    const sd = entry["service-desc"] as Array<{ href: string }>;
    const sc = entry["service-doc"] as Array<{ href: string }>;
    const st = entry.status as Array<{ href: string }>;
    expect(sd[0]?.href).toMatch(/\/openapi\/selfhosted-artifacts\.yaml$/);
    expect(sc[0]?.href).toMatch(/\/selfhosted-api\/$/);
    expect(st[0]?.href).toMatch(/\/health\.json$/);
  });
});
