// @vitest-environment node
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";
import { SelfHostedArtifactStore } from "@/lib/selfhosted/store";

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  title: "Stored payload",
  activeArtifactId: "report",
  artifacts: [
    {
      id: "report",
      kind: "markdown",
      title: "Stored report",
      filename: "report.md",
      content: "# Stored report\n\n- persisted",
    },
  ],
};

function createStore(nowRef: { value: number }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agent-render-store-"));
  const store = new SelfHostedArtifactStore({
    dbPath: path.join(dir, "artifacts.sqlite"),
    ttlMs: 24 * 60 * 60 * 1000,
    now: () => nowRef.value,
  });
  return store;
}

describe("SelfHostedArtifactStore", () => {
  const closers: SelfHostedArtifactStore[] = [];

  afterEach(() => {
    while (closers.length > 0) {
      closers.pop()?.close();
    }
  });

  it("creates, refreshes TTL on read, updates, and deletes artifacts", async () => {
    const nowRef = { value: Date.parse("2026-03-20T00:00:00.000Z") };
    const store = createStore(nowRef);
    closers.push(store);
    const payload = encodeEnvelope(envelope, { codec: "deflate" });

    const created = await store.create(`#${payload}`);
    expect(created.id).toMatch(/[0-9a-f-]{36}/i);
    expect(created.payload).toBe(payload);

    nowRef.value += 60_000;
    const viewed = store.getById(created.id, { refreshTtl: true });
    expect(viewed?.lastViewedAt).toBe(new Date(nowRef.value).toISOString());
    expect(viewed?.expiresAt).toBe(new Date(nowRef.value + 24 * 60 * 60 * 1000).toISOString());

    const updatedPayload = encodeEnvelope({ ...envelope, title: "Updated" }, { codec: "deflate" });
    const updated = await store.update(created.id, updatedPayload);
    expect(updated?.payload).toBe(updatedPayload);

    expect(store.delete(created.id)).toBe(true);
    expect(store.getById(created.id)).toBeNull();
  });

  it("drops expired artifacts on access and cleanup", async () => {
    const nowRef = { value: Date.parse("2026-03-20T00:00:00.000Z") };
    const store = createStore(nowRef);
    closers.push(store);
    const payload = encodeEnvelope(envelope, { codec: "plain" });
    const created = await store.create(payload, "11111111-1111-4111-8111-111111111111");

    nowRef.value = Date.parse(created.expiresAt) + 1;
    expect(store.getById(created.id, { refreshTtl: true })).toBeNull();
    expect(store.cleanupExpired()).toBe(0);
  });
});
