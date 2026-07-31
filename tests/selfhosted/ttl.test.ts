// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";

const originalTtlHours = process.env.AGENT_RENDER_TTL_HOURS;

afterEach(() => {
  if (originalTtlHours === undefined) {
    delete process.env.AGENT_RENDER_TTL_HOURS;
  } else {
    process.env.AGENT_RENDER_TTL_HOURS = originalTtlHours;
  }
  vi.resetModules();
});

describe("TTL configuration", () => {
  it("defaults to 7 days", async () => {
    delete process.env.AGENT_RENDER_TTL_HOURS;
    vi.resetModules();
    const { DEFAULT_TTL_HOURS, TTL_MS } = await import("../../selfhosted/ttl.js");
    expect(DEFAULT_TTL_HOURS).toBe(168);
    expect(TTL_MS).toBe(604_800_000);
  });

  it("accepts a positive integer hour override", async () => {
    process.env.AGENT_RENDER_TTL_HOURS = "12";
    vi.resetModules();
    const { TTL_MS } = await import("../../selfhosted/ttl.js");
    expect(TTL_MS).toBe(43_200_000);
  });

  it.each(["", "0", "-1", "1.5", "hours"])(
    "fails startup for invalid AGENT_RENDER_TTL_HOURS=%j",
    (value) => {
      const modulePath = path.join(process.cwd(), "selfhosted", "ttl.ts");
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--eval", `import(${JSON.stringify(modulePath)})`],
        {
          env: { ...process.env, AGENT_RENDER_TTL_HOURS: value },
          encoding: "utf8",
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "AGENT_RENDER_TTL_HOURS must be a positive integer.",
      );
    },
  );
});

describe("computeExpiresAt", () => {
  it("returns an ISO string approximately one configured TTL in the future", async () => {
    delete process.env.AGENT_RENDER_TTL_HOURS;
    vi.resetModules();
    const { computeExpiresAt, TTL_MS } = await import("../../selfhosted/ttl.js");
    const before = Date.now();
    const result = computeExpiresAt();
    const after = Date.now();

    const resultMs = new Date(result).getTime();
    expect(resultMs).toBeGreaterThanOrEqual(before + TTL_MS);
    expect(resultMs).toBeLessThanOrEqual(after + TTL_MS);
  });
});

describe("isExpired", () => {
  it("returns true for a past timestamp", async () => {
    const { isExpired } = await import("../../selfhosted/ttl.js");
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it("returns false for a future timestamp", async () => {
    const { isExpired } = await import("../../selfhosted/ttl.js");
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });
});
