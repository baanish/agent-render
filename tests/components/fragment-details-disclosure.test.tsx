import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FragmentDetailsDisclosure } from "@/components/viewer/fragment-details-disclosure";
import { MAX_FRAGMENT_LENGTH } from "@/lib/payload/schema";

describe("FragmentDetailsDisclosure", () => {
  it("reveals artifact facts and protocol diagnostics when expanded", async () => {
    render(
      <FragmentDetailsDisclosure
        artifactCount="1"
        artifactFacts={[
          { label: "Kind", value: "markdown" },
          { label: "File", value: "roadmap.md" },
        ]}
        codec="lz"
        fragmentLength="120"
        hashPreview="#agent-render=v1.lz.abc"
        maxLength={String(MAX_FRAGMENT_LENGTH)}
        statusLabel="Decoded"
      />,
    );

    expect(screen.getByText(/Spec sheet/i)).toBeVisible();
    expect(screen.getByText("markdown")).toBeVisible();
    expect(screen.getByText("roadmap.md")).toBeVisible();
    expect(screen.getByText("Decoded")).toBeVisible();
    expect(screen.getByText("lz")).toBeVisible();
    expect(screen.getByText(/#agent-render=v1.lz.abc/i)).toBeVisible();
  });
});
