import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { decodeFragmentAsync } from "../../src/lib/payload/fragment";
import { buildPayloadEnvelope } from "../src/envelope";
import { createInstanceArtifact } from "../src/instance";

const servers: ReturnType<typeof createServer>[] = [];

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close();
    await once(server, "close");
  }));
});

describe("instance mode", () => {
  it("posts the encoded envelope with bearer auth and returns the UUID URL", async () => {
    let capturedRequest: {
      method?: string;
      url?: string;
      authorization?: string;
      payload?: string;
    } = {};
    const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
      const body = JSON.parse(await readRequestBody(request)) as { payload?: unknown };
      capturedRequest = {
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        payload: typeof body.payload === "string" ? body.payload : undefined,
      };
      response.writeHead(201, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: "123e4567-e89b-42d3-a456-426614174000",
        expires_at: "2026-08-01T00:00:00.000Z",
      }));
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("Mock server did not expose a TCP address.");

    const envelope = buildPayloadEnvelope(
      [{ filename: "sample.json", content: "{\"ready\":true}\n" }],
      "auto",
    );
    const baseUrl = `http://127.0.0.1:${address.port}/render`;
    const result = await createInstanceArtifact(envelope, baseUrl, "test-token");

    expect(result).toBe(`${baseUrl}/123e4567-e89b-42d3-a456-426614174000`);
    expect(capturedRequest).toMatchObject({
      method: "POST",
      url: "/render/api/artifacts",
      authorization: "Bearer test-token",
    });
    const decoded = await decodeFragmentAsync(capturedRequest.payload ?? "");
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.envelope.artifacts[0]).toMatchObject({
        kind: "json",
        content: "{\"ready\":true}\n",
      });
    }
  });
});
