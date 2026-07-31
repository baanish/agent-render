import { describe, expect, it } from "vitest";
import { buildPayloadEnvelope } from "../src/envelope";

describe("buildPayloadEnvelope", () => {
  it("combines multiple files into one bundle with unique ids", () => {
    const envelope = buildPayloadEnvelope([
      { filename: "one/report.md", content: "# One" },
      { filename: "two/report.md", content: "# Two" },
    ], "auto", "Reports");

    expect(envelope.title).toBe("Reports");
    expect(envelope.activeArtifactId).toBe("report");
    expect(envelope.artifacts).toHaveLength(2);
    expect(envelope.artifacts.map((artifact) => artifact.id)).toEqual(["report", "report-2"]);
    expect(envelope.artifacts.map((artifact) => artifact.filename)).toEqual(["report.md", "report.md"]);
  });

  it("uses --title for a single artifact without leaking its local path", () => {
    const envelope = buildPayloadEnvelope(
      [{ filename: "/private/work/report.md", content: "# Report" }],
      "auto",
      "Quarterly report",
    );

    expect(envelope.artifacts[0]).toMatchObject({
      title: "Quarterly report",
      filename: "report.md",
    });
  });
});
