import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Validates the committed MCP Server Card JSON for discovery tooling.
 * Shape follows draft SEP-2127 / server.json alignment; see `public/.well-known/mcp/server-card.json`.
 */
describe("MCP Server Card (/.well-known/mcp/server-card.json)", () => {
  it("is valid JSON with required discovery fields", async () => {
    const filePath = path.resolve(__dirname, "../public/.well-known/mcp/server-card.json");
    const raw = await readFile(filePath, "utf-8");
    const card = JSON.parse(raw) as Record<string, unknown>;

    expect(typeof card.name).toBe("string");
    expect((card.name as string).includes("/")).toBe(true);
    expect(typeof card.version).toBe("string");

    const serverInfo = card.serverInfo as Record<string, unknown> | undefined;
    expect(serverInfo).toBeDefined();
    expect(typeof serverInfo?.name).toBe("string");
    expect(typeof serverInfo?.version).toBe("string");

    expect(typeof card.endpoint).toBe("string");
    expect((card.endpoint as string).startsWith("https://")).toBe(true);

    const caps = card.capabilities as Record<string, unknown> | undefined;
    expect(caps).toBeDefined();
    expect(caps?.tools).toBe(false);
    expect(caps?.resources).toBe(false);
    expect(caps?.prompts).toBe(false);

    const remotes = card.remotes as unknown[];
    expect(Array.isArray(remotes)).toBe(true);
    expect(remotes?.length).toBeGreaterThan(0);
    const primary = remotes?.[0] as Record<string, unknown>;
    expect(primary?.type).toBe("streamable-http");
    expect(typeof primary?.url).toBe("string");
    expect(Array.isArray(primary?.supportedProtocolVersions)).toBe(true);
  });
});
