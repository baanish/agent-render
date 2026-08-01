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

  it("does not let a generated suffix collide with a real filename slug", () => {
    const envelope = buildPayloadEnvelope(
      [
        { filename: "report-2.md", content: "# Two" },
        { filename: "a/report.md", content: "# A" },
        { filename: "b/report.md", content: "# B" },
      ],
      "auto",
    );

    const ids = envelope.artifacts.map((artifact) => artifact.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(["report-2", "report", "report-3"]);
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

  it("builds a kit html artifact when --kind html is explicit", () => {
    const envelope = buildPayloadEnvelope(
      [{ filename: "report.html", content: '<div class="ar-card">ok</div>' }],
      "html",
    );

    expect(envelope.artifacts[0]).toMatchObject({
      kind: "html",
      content: '<div class="ar-card">ok</div>',
    });
  });

  it("keeps .html files as code source view under auto detection", () => {
    const envelope = buildPayloadEnvelope([{ filename: "page.html", content: "<p>hi</p>" }], "auto");
    expect(envelope.artifacts[0]).toMatchObject({ kind: "code", language: "html" });
  });

});
