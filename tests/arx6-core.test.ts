// @vitest-environment node
import { describe, it } from "vitest";
import { buildChecks } from "../experiments/arx6/check.mjs";

const checks = await buildChecks();

describe("experimental ARX6 frozen core (not registered in the viewer)", () => {
  for (const check of checks) {
    it(check.name, () => check.run(), 180_000);
  }
});
