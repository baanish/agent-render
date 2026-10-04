import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerShell } from "@/components/viewer-shell";
import type { GeneratedArtifactLink, LinkCreatorDraft } from "@/lib/payload/link-creator";
import type { ParsedPayload } from "@/lib/payload/schema";

const codecMock = vi.hoisted(() => ({
  generations: [] as {
    signal?: AbortSignal;
    reject: (error: Error) => void;
  }[],
  decodes: [] as {
    generationAbortedAtStart: boolean | undefined;
    reject: (error: unknown) => void;
    resolve: (result: ParsedPayload) => void;
  }[],
}));

vi.mock("@/lib/payload/link-creator", () => ({
  createGeneratedArtifactLinkAsync: vi.fn((_draft: LinkCreatorDraft, _baseUrl?: string, signal?: AbortSignal) =>
    new Promise<GeneratedArtifactLink>((_resolve, reject) => {
      codecMock.generations.push({ signal, reject });
    }),
  ),
}));

vi.mock("@/lib/payload/browser-codec", () => ({
  decodeFragmentInBrowser: vi.fn(() =>
    new Promise<ParsedPayload>((resolve, reject) => {
      codecMock.decodes.push({
        generationAbortedAtStart: codecMock.generations.at(-1)?.signal?.aborted,
        reject,
        resolve,
      });
    }),
  ),
}));

vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/viewer/artifact-stage", () => ({
  ArtifactStage: () => <section data-testid="decoded-artifact" />,
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  codecMock.generations.length = 0;
  codecMock.decodes.length = 0;
  vi.clearAllMocks();
});

describe("ViewerShell decode failures", () => {
  it.each<[unknown, string]>([
    [new Error("Payload processing timed out. Try a smaller artifact."), "Payload processing timed out. Try a smaller artifact."],
    ["unknown failure", "The fragment payload could not be decoded by this browser session."],
    [new Error("   "), "The fragment payload could not be decoded by this browser session."],
  ])("shows a useful error for %s", async (error, message) => {
    window.history.replaceState(null, "", "/#psample");
    render(<ViewerShell />);
    await waitFor(() => expect(codecMock.decodes).toHaveLength(1));

    await act(async () => {
      codecMock.decodes[0].reject(error);
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});

describe("ViewerShell creator cancellation", () => {
  it.each(["auto", "arx6"])("aborts pending %s generation before enqueueing sample navigation decode", async (codec) => {
    const user = userEvent.setup();
    render(<ViewerShell />);

    await user.click(await screen.findByRole("button", { name: codec }));
    await user.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(codecMock.generations).toHaveLength(1));
    expect(codecMock.generations[0].signal?.aborted).toBe(false);

    await user.click(await screen.findByRole("link", { name: /Viewer bootstrap/ }));
    await waitFor(() => expect(codecMock.decodes).toHaveLength(1));

    // Capture the signal at decode entry: unmount after decoding is too late to free the worker.
    expect(codecMock.decodes[0].generationAbortedAtStart).toBe(true);
    expect(screen.getByRole("heading", { name: "Create a link" })).toBeVisible();

    await act(async () => {
      codecMock.generations[0].reject(new DOMException("Payload processing was cancelled.", "AbortError"));
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => {
      codecMock.decodes[0].resolve({
        ok: true,
        envelope: {
          v: 1,
          codec: "plain",
          activeArtifactId: "sample",
          artifacts: [{ id: "sample", kind: "markdown", content: "# Sample" }],
        },
        rawLength: 8,
      });
    });
    expect(await screen.findByTestId("decoded-artifact")).toBeVisible();
  });
});
