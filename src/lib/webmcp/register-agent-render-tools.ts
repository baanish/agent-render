import type { RefObject } from "react";

/** Stable keys for built-in example fragments (order matches `sampleLinks` in examples). */
export const WEBMCP_EXAMPLE_KEYS = [
  "maintainer-kickoff",
  "viewer-bootstrap",
  "phase-1-sample-diff",
  "data-export-preview",
  "arx-showcase",
  "malformed-manifest",
] as const;

export type WebMcpExampleKey = (typeof WEBMCP_EXAMPLE_KEYS)[number];

export type WebMcpViewerState = {
  hasFragment: boolean;
  fragmentLength: number;
  decodeOk: boolean;
  parseMessage?: string;
  envelopeTitle?: string;
  codec?: string;
  artifactIds: string[];
  activeArtifactId?: string;
  activeArtifactKind?: string;
  activeArtifactTitle?: string;
  exampleKeys: readonly string[];
  exampleTitles: readonly string[];
};

/**
 * Latest imperative actions for WebMCP tool callbacks. Updated each render so tools always
 * invoke current viewer behavior without re-registering.
 */
export type AgentRenderWebMcpActions = {
  getViewerState: () => WebMcpViewerState;
  loadSampleByKey: (key: string) => boolean;
  loadSampleByTitle: (substring: string) => boolean;
  selectArtifact: (artifactId: string) => void;
  copyActiveArtifact: () => Promise<void>;
  downloadActiveArtifact: () => void;
  printActiveMarkdown: () => void;
  goHome: () => void;
};

/**
 * Registers agent-render tools on `navigator.modelContext` when the WebMCP API is present.
 * Uses one `AbortController` so all tools unregister together on cleanup.
 *
 * @param actionsRef Ref updated each render with fresh callbacks and `getViewerState`.
 * @returns Cleanup to run on unmount (aborts registration).
 */
export function registerAgentRenderWebMcpTools(actionsRef: RefObject<AgentRenderWebMcpActions | null>): () => void {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return () => {};
  }

  const modelContext = navigator.modelContext;
  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return () => {};
  }

  const abort = new AbortController();
  const { signal } = abort;

  const read = () => {
    const current = actionsRef.current;
    if (!current) {
      throw new Error("agent-render WebMCP actions are not initialized");
    }
    return current;
  };

  modelContext.registerTool(
    {
      name: "agent_render.get_viewer_state",
      title: "Get viewer state",
      description:
        "Returns the current agent-render URL fragment status: decode result, envelope summary, active artifact, and available example keys. Read-only.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async () => read().getViewerState(),
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.list_examples",
      title: "List example fragments",
      description:
        "Returns the stable example keys and titles for built-in sample fragments users can load into the viewer.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const state = read().getViewerState();
        return { exampleKeys: [...state.exampleKeys], titles: [...state.exampleTitles] };
      },
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.load_example_fragment",
      title: "Load example fragment",
      description:
        "Navigates the viewer to a built-in sample by stable example key (preferred), by title substring, or by index 0–5. Updates the URL hash.",
      inputSchema: {
        type: "object",
        properties: {
          exampleKey: {
            type: "string",
            description:
              "Stable key: maintainer-kickoff, viewer-bootstrap, phase-1-sample-diff, data-export-preview, arx-showcase, malformed-manifest",
            enum: [...WEBMCP_EXAMPLE_KEYS],
          },
          titleContains: {
            type: "string",
            description: "Case-insensitive substring match against sample titles",
          },
          index: {
            type: "integer",
            minimum: 0,
            maximum: 5,
            description: "Zero-based index into the sample list (same order as the homepage)",
          },
        },
        additionalProperties: false,
      },
      execute: async (input) => {
        const obj = input as Record<string, unknown>;
        if (typeof obj.exampleKey === "string") {
          const ok = read().loadSampleByKey(obj.exampleKey);
          return ok ? { ok: true, method: "exampleKey", exampleKey: obj.exampleKey } : { ok: false, error: "unknown_example_key" };
        }
        if (typeof obj.titleContains === "string" && obj.titleContains.trim()) {
          const ok = read().loadSampleByTitle(obj.titleContains.trim());
          return ok ? { ok: true, method: "titleContains" } : { ok: false, error: "no_matching_title" };
        }
        if (typeof obj.index === "number" && Number.isInteger(obj.index)) {
          const key = WEBMCP_EXAMPLE_KEYS[obj.index];
          if (!key) {
            return { ok: false, error: "bad_index" };
          }
          const ok = read().loadSampleByKey(key);
          return ok ? { ok: true, method: "index", exampleKey: key } : { ok: false, error: "bad_index" };
        }
        return { ok: false, error: "provide_exampleKey_titleContains_or_index" };
      },
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.select_artifact",
      title: "Select artifact",
      description:
        "When a multi-artifact bundle is loaded, switches the active artifact by id and rewrites the URL fragment. No-op if the id is already active or the bundle is missing.",
      inputSchema: {
        type: "object",
        properties: {
          artifactId: { type: "string", minLength: 1, description: "Artifact id from the decoded envelope" },
        },
        required: ["artifactId"],
        additionalProperties: false,
      },
      execute: async (input) => {
        const id = (input as { artifactId?: string }).artifactId;
        if (!id) {
          return { ok: false, error: "missing_artifactId" };
        }
        read().selectArtifact(id);
        return { ok: true, artifactId: id };
      },
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.copy_active_artifact",
      title: "Copy active artifact",
      description: "Copies the current artifact body (text) to the clipboard, same as the Copy button.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        await read().copyActiveArtifact();
        return { ok: true };
      },
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.download_active_artifact",
      title: "Download active artifact",
      description: "Downloads the active artifact as a file, same as the Download button.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        read().downloadActiveArtifact();
        return { ok: true };
      },
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.print_markdown_artifact",
      title: "Print markdown",
      description:
        "If the active artifact is markdown, opens the browser print dialog for print-to-PDF. No-op for other kinds.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        read().printActiveMarkdown();
        return { ok: true };
      },
    },
    { signal },
  );

  modelContext.registerTool(
    {
      name: "agent_render.clear_fragment",
      title: "Clear fragment / home",
      description: "Clears the URL hash and returns to the empty state and link creator, like the site logo.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        read().goHome();
        return { ok: true };
      },
    },
    { signal },
  );

  return () => {
    abort.abort();
  };
}

/** Maps example keys to sample link hashes (same order as `WEBMCP_EXAMPLE_KEYS`). */
export function buildExampleHashByKey(sampleHashes: readonly string[]): Record<WebMcpExampleKey, string> {
  const out = {} as Record<WebMcpExampleKey, string>;
  for (let i = 0; i < WEBMCP_EXAMPLE_KEYS.length; i += 1) {
    const key = WEBMCP_EXAMPLE_KEYS[i];
    const h = sampleHashes[i];
    if (h !== undefined) {
      out[key] = h;
    }
  }
  return out;
}
