import { describe, expect, it } from "vitest";
import { exceedsTreeLimits } from "@/lib/json/tree-limits";

describe("json tree limits", () => {
  it("allows small payloads", () => {
    expect(exceedsTreeLimits({ ok: true, items: [1, 2, 3] }, 64, 5000)).toBe(false);
  });

  it("blocks overly deep payloads", () => {
    let value: { child?: unknown } = {};
    const root = value;
    for (let i = 0; i < 70; i += 1) {
      value.child = {};
      value = value.child as { child?: unknown };
    }

    expect(exceedsTreeLimits(root as never, 64, 5000)).toBe(true);
  });

  it("blocks overly large payloads", () => {
    const value = Array.from({ length: 6000 }, (_, i) => i);
    expect(exceedsTreeLimits(value, 64, 5000)).toBe(true);
  });
});
