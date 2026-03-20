// @vitest-environment node
import os from "node:os";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";
import { createSelfHostedServer } from "../../server/selfhosted-app";

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Server-backed bundle",
  activeArtifactId: "report",
  artifacts: [
    {
      id: "report",
      kind: "markdown",
      title: "Hello",
      content: "# Hello self-hosted",
    },
  ],
};

function createStaticDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agent-render-static-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><html><head></head><body><div id=\"root\"></div></body></html>");
  return dir;
}

describe("self-hosted server", () => {
  const cleanups: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it("supports CRUD, TTL refresh, and injected viewer bootstrap HTML", async () => {
    const nowRef = { value: Date.parse("2026-03-20T00:00:00.000Z") };
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "agent-render-server-"));
    const { server, store } = createSelfHostedServer({
      dbPath: path.join(tempDir, "artifacts.sqlite"),
      staticDir: createStaticDir(),
      now: () => nowRef.value,
      publicOrigin: "https://agent-render.example.com",
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      store.close();
    });

    const payload = encodeEnvelope(envelope, { codec: "deflate" });
    const createResponse = await fetch(`${baseUrl}/api/artifacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { id: string; url: string; expiresAt: string };
    expect(created.url).toBe(`https://agent-render.example.com/${created.id}`);

    nowRef.value += 30_000;
    const getResponse = await fetch(`${baseUrl}/api/artifacts/${created.id}`);
    expect(getResponse.status).toBe(200);
    const fetched = (await getResponse.json()) as { lastViewedAt: string; expiresAt: string };
    expect(fetched.lastViewedAt).toBe(new Date(nowRef.value).toISOString());
    expect(fetched.expiresAt).toBe(new Date(nowRef.value + 24 * 60 * 60 * 1000).toISOString());

    const pageResponse = await fetch(`${baseUrl}/${created.id}`);
    expect(pageResponse.status).toBe(200);
    const pageHtml = await pageResponse.text();
    expect(pageHtml).toContain("window.__AGENT_RENDER_STORED_PAYLOAD__");
    expect(pageHtml).toContain(created.id);

    const updatedPayload = encodeEnvelope({ ...envelope, title: "Updated server-backed bundle" }, { codec: "deflate" });
    const putResponse = await fetch(`${baseUrl}/api/artifacts/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: updatedPayload }),
    });
    expect(putResponse.status).toBe(200);

    const deleteResponse = await fetch(`${baseUrl}/api/artifacts/${created.id}`, { method: "DELETE" });
    expect(deleteResponse.status).toBe(200);
    const missingResponse = await fetch(`${baseUrl}/api/artifacts/${created.id}`);
    expect(missingResponse.status).toBe(404);
  });

  it("fails clearly for expired payload routes", async () => {
    const nowRef = { value: Date.parse("2026-03-20T00:00:00.000Z") };
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "agent-render-server-"));
    const { server, store } = createSelfHostedServer({
      dbPath: path.join(tempDir, "artifacts.sqlite"),
      staticDir: createStaticDir(),
      now: () => nowRef.value,
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    cleanups.push(async () => {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      store.close();
    });

    const payload = encodeEnvelope(envelope, { codec: "plain" });
    const created = await store.create(payload, "22222222-2222-4222-8222-222222222222");
    nowRef.value = Date.parse(created.expiresAt) + 1;

    const response = await fetch(`${baseUrl}/${created.id}`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Artifact unavailable");
  });
});
