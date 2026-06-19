import { describe, expect, it } from "vitest";

import { budgets, evaluateBudget } from "../scripts/check-build-budgets.mjs";

describe("build budget policy", () => {
  // Characterization: changing a budget requires updating this table AND the
  // rationale comment together.
  it("pins the budget names and gzipped ceilings", () => {
    const table = budgets.map((budget) => ({
      name: budget.name,
      maxBytes: budget.maxBytes,
    }));

    expect(table).toEqual([
      { name: "homepage route JS", maxBytes: 115 * 1024 },
      { name: "code renderer deferred JS", maxBytes: 100 * 1024 },
      { name: "markdown renderer deferred JS", maxBytes: 52 * 1024 },
      { name: "rich diff library deferred JS", maxBytes: 340 * 1024 },
    ]);
  });
});

describe("evaluateBudget boundary semantics", () => {
  const budget = { name: "example", maxBytes: 1024 };

  it("passes at exactly maxBytes", () => {
    expect(evaluateBudget(budget, 1024)).toEqual({
      name: "example",
      maxBytes: 1024,
      actualBytes: 1024,
      ok: true,
    });
  });

  it("fails at maxBytes + 1", () => {
    expect(evaluateBudget(budget, 1025)).toEqual({
      name: "example",
      maxBytes: 1024,
      actualBytes: 1025,
      ok: false,
    });
  });
});
