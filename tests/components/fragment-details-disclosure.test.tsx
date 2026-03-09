import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FragmentDetailsDisclosure } from "@/components/viewer/fragment-details-disclosure";

describe("FragmentDetailsDisclosure", () => {
  it("reveals metadata when expanded", async () => {
    render(
      <FragmentDetailsDisclosure
        codec="lz"
        fragmentLength="120"
        hashPreview="#agent-render=v1.lz.abc"
        maxLength="8000"
        statusLabel="Decoded"
        statusMessage="Envelope is valid and ready for viewer routing."
      />,
    );

    const summary = screen.getByText(/Codec, transport, budget, and hash preview/i);
    await userEvent.click(summary);

    expect(screen.getByText("Decoded")).toBeVisible();
    expect(screen.getByText("lz")).toBeVisible();
    expect(screen.getByText(/#agent-render=v1.lz.abc/i)).toBeVisible();
  });
});
