// @vitest-environment node
import { describe, it, expect } from "vitest";
import { validatePayload } from "../../selfhosted/validate.js";

describe("validatePayload", () => {
  it("accepts a valid payload string", () => {
    expect(validatePayload("agent-render=v1.plain.abc123")).toEqual({ ok: true });
  });

  it("rejects non-string values", () => {
    expect(validatePayload(123)).toEqual({ ok: false, message: "Payload must be a string." });
    expect(validatePayload(null)).toEqual({ ok: false, message: "Payload must be a string." });
    expect(validatePayload(undefined)).toEqual({ ok: false, message: "Payload must be a string." });
  });

  it("rejects empty string", () => {
    expect(validatePayload("")).toEqual({ ok: false, message: "Payload must not be empty." });
  });

  it("rejects oversized payload", () => {
    const huge = "x".repeat(500_001);
    const result = validatePayload(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("maximum allowed length");
    }
  });
});
