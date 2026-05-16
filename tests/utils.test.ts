import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names while skipping falsey values", () => {
    expect(cn("base", false, null, undefined, "active")).toBe("base active");
  });

  it("returns an empty string when every input is falsey", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});
