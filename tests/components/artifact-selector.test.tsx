import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileCode2, FileText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactSelector } from "@/components/viewer/artifact-selector";
import type { ArtifactPayload } from "@/lib/payload/schema";

const artifacts: ArtifactPayload[] = [
  { id: "roadmap", kind: "markdown", title: "Roadmap", content: "# roadmap" },
  { id: "viewer", kind: "code", title: "viewer.tsx", content: "export {};", language: "tsx" },
];

describe("ArtifactSelector", () => {
  it("renders artifacts and marks the active item", async () => {
    const onSelect = vi.fn();
    render(
      <ArtifactSelector
        artifacts={artifacts}
        activeArtifactId="roadmap"
        getHeading={(artifact) => artifact.title ?? artifact.id}
        getSupportingLabel={(artifact) => artifact.id}
        kindIcons={{ markdown: FileText, code: FileCode2, diff: FileText, csv: FileText, json: FileText }}
        onSelect={onSelect}
      />,
    );

    const active = screen.getByRole("button", { name: /Open artifact Roadmap/i });
    const inactive = screen.getByRole("button", { name: /Open artifact viewer.tsx/i });
    expect(active).toHaveAttribute("aria-pressed", "true");
    expect(inactive).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(inactive);
    expect(onSelect).toHaveBeenCalledWith("viewer");
  });
});
