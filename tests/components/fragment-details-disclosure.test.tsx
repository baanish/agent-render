import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FragmentDetailsDisclosure } from "@/components/viewer/fragment-details-disclosure";
import { MAX_FRAGMENT_LENGTH } from "@/lib/payload/schema";

describe("FragmentDetailsDisclosure", () => {
  it("opens fragment metadata by default and keeps the disclosure toggle", async () => {
    render(
      <FragmentDetailsDisclosure
        codec="lz"
        fragmentLength="120"
        hashPreview="#agent-render=v1.lz.abc"
        maxLength={String(MAX_FRAGMENT_LENGTH)}
      />,
    );

    const disclosure = screen.getByTestId("fragment-disclosure");
    const summary = screen.getByText("Fragment details");

    expect(disclosure).toHaveAttribute("open");
    await userEvent.click(summary);
    expect(disclosure).not.toHaveAttribute("open");
    await userEvent.click(summary);
    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByText("lz")).toBeVisible();
    expect(screen.getByText(/#agent-render=v1.lz.abc/i)).toBeVisible();
  });
});
