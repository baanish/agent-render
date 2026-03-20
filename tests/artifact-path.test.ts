import { describe, expect, it } from "vitest";
import { getArtifactIdFromPathname } from "@/lib/selfhosted/artifact-path";

const sample = "550e8400-e29b-41d4-a716-446655440000";

describe("getArtifactIdFromPathname", () => {
  it("parses a trailing UUID segment", () => {
    expect(getArtifactIdFromPathname(`/${sample}/`)).toBe(sample);
    expect(getArtifactIdFromPathname(`/${sample}`)).toBe(sample);
  });

  it("strips an optional base path prefix", () => {
    expect(getArtifactIdFromPathname(`/app/${sample}/`, "/app")).toBe(sample);
  });

  it("returns null for the homepage", () => {
    expect(getArtifactIdFromPathname("/")).toBeNull();
    expect(getArtifactIdFromPathname("/app/", "/app")).toBeNull();
  });
});
