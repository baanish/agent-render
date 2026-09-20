import { describe, expect, it } from "vitest";
import type { LinkCreatorDraft } from "@/lib/payload/link-creator";
import {
  assertReadableLocalArtifactFile,
  createDraftFromLocalFile,
  inferArtifactKindFromFilename,
  MAX_LOCAL_FILE_BYTES,
} from "@/lib/payload/local-file";
import { MAX_DECODED_PAYLOAD_LENGTH } from "@/lib/payload/schema";

const baseDraft: LinkCreatorDraft = {
  kind: "markdown",
  title: "Product brief",
  filename: "brief.md",
  content: "# Launch note",
  language: "tsx",
  diffView: "unified",
  codec: "auto",
};

describe("inferArtifactKindFromFilename", () => {
  it("maps document and data extensions onto artifact kinds", () => {
    expect(inferArtifactKindFromFilename("notes.md")).toBe("markdown");
    expect(inferArtifactKindFromFilename("notes.markdown")).toBe("markdown");
    expect(inferArtifactKindFromFilename("manifest.json")).toBe("json");
    expect(inferArtifactKindFromFilename("rows.csv")).toBe("csv");
    expect(inferArtifactKindFromFilename("rows.tsv")).toBe("csv");
    expect(inferArtifactKindFromFilename("fix.patch")).toBe("diff");
    expect(inferArtifactKindFromFilename("fix.diff")).toBe("diff");
  });

  it("maps common source extensions to code and leaves unknown names alone", () => {
    expect(inferArtifactKindFromFilename("viewer-shell.tsx")).toBe("code");
    expect(inferArtifactKindFromFilename("hello.py")).toBe("code");
    expect(inferArtifactKindFromFilename("notes.txt")).toBeNull();
    expect(inferArtifactKindFromFilename("Makefile")).toBeNull();
  });
});

describe("createDraftFromLocalFile", () => {
  it("loads markdown into the draft and keeps codec settings", () => {
    const draft = createDraftFromLocalFile(
      {
        name: "kickoff.md",
        size: 18,
        type: "text/markdown",
        text: "# File kickoff\n",
      },
      baseDraft,
    );

    expect(draft).toMatchObject({
      kind: "markdown",
      title: "kickoff",
      filename: "kickoff.md",
      content: "# File kickoff\n",
      codec: "auto",
      diffView: "unified",
    });
  });

  it("switches kind and language for a source file", () => {
    const draft = createDraftFromLocalFile(
      {
        name: "src/hello.py",
        size: 12,
        type: "text/x-python",
        text: "print('hi')\n",
      },
      baseDraft,
    );

    expect(draft.kind).toBe("code");
    expect(draft.filename).toBe("hello.py");
    expect(draft.title).toBe("hello");
    expect(draft.language).toBe("python");
    expect(draft.content).toBe("print('hi')\n");
  });

  it("accepts TypeScript even when the picker reports a video MIME type", () => {
    const draft = createDraftFromLocalFile(
      {
        name: "viewer.ts",
        size: 18,
        type: "video/mp2t",
        text: "export const n = 1;\n",
      },
      baseDraft,
    );

    expect(draft.kind).toBe("code");
    expect(draft.filename).toBe("viewer.ts");
    expect(draft.language).toBe("ts");
    expect(draft.content).toBe("export const n = 1;\n");
  });

  it("infers language for other recognized source extensions", () => {
    expect(
      createDraftFromLocalFile(
        { name: "main.rs", size: 16, text: "fn main() {}\n" },
        baseDraft,
      ).language,
    ).toBe("rust");
    expect(
      createDraftFromLocalFile(
        { name: "main.go", size: 16, text: "package main\n" },
        baseDraft,
      ).language,
    ).toBe("go");
  });

  it("keeps the current kind for unknown text extensions", () => {
    const draft = createDraftFromLocalFile(
      {
        name: "notes.txt",
        size: 5,
        type: "text/plain",
        text: "hello",
      },
      { ...baseDraft, kind: "csv" },
    );

    expect(draft.kind).toBe("csv");
    expect(draft.filename).toBe("notes.txt");
    expect(draft.content).toBe("hello");
  });

  it("strips a UTF-8 BOM", () => {
    const draft = createDraftFromLocalFile(
      {
        name: "notes.md",
        size: 8,
        text: "\uFEFF# Hi\n",
      },
      baseDraft,
    );

    expect(draft.content).toBe("# Hi\n");
  });

  it("rejects empty, binary, and oversized files", () => {
    expect(() =>
      assertReadableLocalArtifactFile({ name: "empty.md", size: 0, type: "text/markdown" }),
    ).toThrow("The selected file is empty.");

    expect(() =>
      assertReadableLocalArtifactFile({
        name: "photo.png",
        size: 12,
        type: "image/png",
      }),
    ).toThrow("This file looks binary. Choose a text file.");

    expect(() =>
      createDraftFromLocalFile(
        { name: "notes.md", size: 12, text: "ok\0still" },
        baseDraft,
      ),
    ).toThrow("This file looks binary. Choose a text file.");

    expect(() =>
      createDraftFromLocalFile(
        { name: "notes.md", size: 6, text: "ab\uFFFDcd" },
        baseDraft,
      ),
    ).toThrow("This file looks binary. Choose a text file.");

    expect(() =>
      assertReadableLocalArtifactFile({
        name: "unknown.xyz",
        size: 12,
        type: "application/octet-stream",
      }),
    ).toThrow("This file looks binary. Choose a text file.");

    expect(() =>
      createDraftFromLocalFile(
        { name: "notes.md", size: 2, text: "  \n" },
        baseDraft,
      ),
    ).toThrow("The selected file is empty.");

    expect(() =>
      createDraftFromLocalFile(
        {
          name: "notes.md",
          size: MAX_DECODED_PAYLOAD_LENGTH + 1,
          text: "a".repeat(MAX_DECODED_PAYLOAD_LENGTH + 1),
        },
        baseDraft,
      ),
    ).toThrow("decoded payload limit");

    expect(() =>
      assertReadableLocalArtifactFile({
        name: "huge.md",
        size: MAX_LOCAL_FILE_BYTES + 1,
        type: "text/markdown",
      }),
    ).toThrow("local-file limit");
  });
});
