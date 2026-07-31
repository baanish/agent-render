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

  it("parses a choices JSON document", () => {
    const envelope = buildPayloadEnvelope(
      [
        {
          filename: "next-steps.json",
          content: JSON.stringify({
            prompt: "Which fixes land?",
            multi: true,
            options: [
              { id: "a", label: "Fix TTL", detail: "off by one" },
              { id: "b", label: "Document auth" },
            ],
          }),
        },
      ],
      "choices",
    );

    expect(envelope.artifacts[0]).toMatchObject({
      kind: "choices",
      prompt: "Which fixes land?",
      multi: true,
      options: [
        { id: "a", label: "Fix TTL", detail: "off by one" },
        { id: "b", label: "Document auth" },
      ],
    });
  });

  it("rejects malformed choices documents with a shape hint", () => {
    expect(() => buildPayloadEnvelope([{ filename: "bad.json", content: "not json" }], "choices")).toThrow(
      /must be JSON shaped/,
    );
    expect(() =>
      buildPayloadEnvelope([{ filename: "bad.json", content: '{"options": [{"id": 1, "label": "x"}]}' }], "choices"),
    ).toThrow(/string "id" and "label"/);
    expect(() =>
      buildPayloadEnvelope(
        [{ filename: "dup.json", content: '{"options": [{"id": "a", "label": "x"}, {"id": "a", "label": "y"}]}' }],
        "choices",
      ),
    ).toThrow(/duplicate option id/);
  });
});
