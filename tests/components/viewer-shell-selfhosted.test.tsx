import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ViewerShell } from "@/components/viewer-shell";
import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Stored bootstrap bundle",
  activeArtifactId: "artifact-1",
  artifacts: [
    {
      id: "artifact-1",
      kind: "markdown",
      title: "Stored markdown",
      filename: "stored.md",
      content: "# Stored markdown\n\nThis came from UUID mode.",
    },
  ],
};

describe("ViewerShell self-hosted bootstrap", () => {
  afterEach(() => {
    delete window.__AGENT_RENDER_STORED_PAYLOAD__;
    window.history.replaceState(null, "", "/");
  });

  it("renders the stored payload through the shared viewer flow", async () => {
    window.__AGENT_RENDER_STORED_PAYLOAD__ = {
      id: "33333333-3333-4333-8333-333333333333",
      payload: encodeEnvelope(envelope, { codec: "deflate" }),
      expiresAt: "2026-03-21T00:00:00.000Z",
    };

    render(<ViewerShell />);

    await waitFor(() => expect(screen.getByText("Stored bootstrap bundle")).toBeInTheDocument());
    expect(screen.getByText("UUID mode")).toBeInTheDocument();
    expect(screen.getAllByText("Stored markdown").length).toBeGreaterThan(0);
    expect(screen.getByText("Selecting an artifact updates the active viewer state locally while keeping the stored payload and UUID route unchanged.")).toBeInTheDocument();
  });
});
