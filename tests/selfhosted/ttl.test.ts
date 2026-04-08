// @vitest-environment node
import { describe, it, expect } from "vitest";
import { TTL_MS, computeExpiresAt, isExpired } from "../../selfhosted/ttl.js";

describe("TTL_MS", () => {
  it("equals 24 hours in milliseconds", () => {
    expect(TTL_MS).toBe(86_400_000);
  });
});

describe("computeExpiresAt", () => {
  it("returns an ISO string approximately 24h in the future", () => {
    const before = Date.now();
    const result = computeExpiresAt();
    const after = Date.now();

    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(resultMs).toBeLessThanOrEqual(after + TTL_MS);
  });
});

describe("isExpired", () => {
  it("returns true for a past timestamp", () => {
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it("returns false for a future timestamp", () => {
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });
});
