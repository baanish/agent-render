/**
 * Type declarations for the build-budget policy script's public exports.
 *
 * Kept in sync with scripts/check-build-budgets.mjs so TypeScript consumers (e.g. the
 * tests/build-budgets.test.ts characterization test) get real types without enabling
 * `allowJs`. The runtime contract lives in the .mjs; this only describes its public shape.
 */

export type Budget = {
  name: string;
  maxBytes: number;
  type?: "route" | "loadable";
  route?: string;
  importKeyParts?: string[];
};

export type BudgetEvaluation = {
  name: string;
  maxBytes: number;
  actualBytes: number;
  ok: boolean;
};

/** The owned build-budget policy table (chunk name pattern → gzipped ceiling). */
export const budgets: Budget[];

/** Pure size-vs-budget decision used by the enforcement loop and pinned by tests. */
export function evaluateBudget(
  budget: Pick<Budget, "name" | "maxBytes">,
  actualBytes: number,
): BudgetEvaluation;
