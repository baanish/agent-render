/**
 * Minimal TypeScript surface for the WebMCP `navigator.modelContext` API (draft).
 * @see https://webmachinelearning.github.io/webmcp/
 */

interface ModelContextClient {
  requestUserInteraction(callback: () => Promise<unknown>): Promise<unknown>;
}

type ToolExecuteCallback = (input: object, client: ModelContextClient) => Promise<unknown>;

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  execute: ToolExecuteCallback;
  annotations?: { readOnlyHint?: boolean };
}

interface ModelContextRegisterToolOptions {
  signal?: AbortSignal;
}

interface ModelContext {
  registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): undefined;
}

interface Navigator {
  readonly modelContext?: ModelContext;
}
