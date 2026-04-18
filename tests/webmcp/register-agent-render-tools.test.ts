import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerAgentRenderWebMcpTools, WEBMCP_EXAMPLE_KEYS, type AgentRenderWebMcpActions } from "@/lib/webmcp/register-agent-render-tools";

describe("registerAgentRenderWebMcpTools", () => {
  const originalModelContext = navigator.modelContext;

  afterEach(() => {
    Object.defineProperty(navigator, "modelContext", {
      configurable: true,
      value: originalModelContext,
    });
    vi.restoreAllMocks();
  });

  it("registers tools when modelContext.registerTool exists", () => {
    vi.stubGlobal("isSecureContext", true);

    const registerTool = vi.fn();
    Object.defineProperty(navigator, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    const actions: RefObject<AgentRenderWebMcpActions | null> = {
      current: {
        getViewerState: () => ({
          hasFragment: false,
          fragmentLength: 0,
          decodeOk: true,
          artifactIds: [],
          exampleKeys: WEBMCP_EXAMPLE_KEYS,
          exampleTitles: [],
        }),
        loadSampleByKey: () => true,
        loadSampleByTitle: () => true,
        selectArtifact: () => {},
        copyActiveArtifact: async () => {},
        downloadActiveArtifact: () => {},
        printActiveMarkdown: () => {},
        goHome: () => {},
      },
    };

    const cleanup = registerAgentRenderWebMcpTools(actions);
    expect(registerTool).toHaveBeenCalledTimes(8);
    const names = registerTool.mock.calls.map((call) => (call[0] as { name: string }).name);
    expect(names).toContain("agent_render.get_viewer_state");
    expect(names).toContain("agent_render.load_example_fragment");

    cleanup();
    expect(registerTool.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
  });

  it("is a no-op when registerTool is missing", () => {
    Object.defineProperty(navigator, "modelContext", {
      configurable: true,
      value: {},
    });

    const actions: RefObject<AgentRenderWebMcpActions | null> = { current: null };
    const cleanup = registerAgentRenderWebMcpTools(actions);
    expect(cleanup).toBeInstanceOf(Function);
    cleanup();
  });
});
