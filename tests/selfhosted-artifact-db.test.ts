import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encodeEnvelope } from "@/lib/payload/fragment";
import type { PayloadEnvelope } from "@/lib/payload/schema";
// Self-hosted store ships as JavaScript for the Node entrypoint; types are not emitted.
// @ts-expect-error — JavaScript module without a TS declaration file
import { openArtifactStore } from "../selfhosted/artifact-db.mjs";

const sampleEnvelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  activeArtifactId: "a",
  artifacts: [
    {
      id: "a",
      kind: "markdown",
      content: "# test",
    },
  ],
};

const samplePayload = encodeEnvelope(sampleEnvelope, { codec: "plain" });

describe("selfhosted artifact-db", () => {
  let store: ReturnType<typeof openArtifactStore>;

  beforeEach(() => {
    store = openArtifactStore(":memory:");
  });

  afterEach(() => {
    store.db.close();
  });

  it("creates and retrieves artifacts with sliding expiry", () => {
    const created = store.createArtifact(samplePayload);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);

    const first = store.getArtifact(created.id);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const firstExpiry = first.row.expires_at;
    const second = store.getArtifact(created.id);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }

    expect(second.row.expires_at).toBeGreaterThanOrEqual(firstExpiry);
  });

  it("returns expired for stale rows", () => {
    const created = store.createArtifact(samplePayload);
    const shift = store.db.prepare(`UPDATE artifacts SET expires_at = ? WHERE id = ?`);
    shift.run(Date.now() - 1000, created.id);

    const result = store.getArtifact(created.id);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.reason).toBe("expired");
  });

  it("updates payload and refreshes expiry", () => {
    const created = store.createArtifact(samplePayload);
    const nextPayload = encodeEnvelope(
      {
        ...sampleEnvelope,
        artifacts: [{ id: "b", kind: "markdown", content: "updated" }],
        activeArtifactId: "b",
      },
      { codec: "plain" },
    );
    const updated = store.updateArtifact(created.id, nextPayload);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }

    const row = store.getArtifact(created.id);
    expect(row.ok).toBe(true);
    if (!row.ok) {
      return;
    }

    expect(row.row.payload).toBe(nextPayload);
  });

  it("deletes artifacts", () => {
    const created = store.createArtifact(samplePayload);
    expect(store.deleteArtifact(created.id)).toBe(true);
    expect(store.deleteArtifact(created.id)).toBe(false);
  });

  it("purges expired artifacts", () => {
    const created = store.createArtifact(samplePayload);
    const shift = store.db.prepare(`UPDATE artifacts SET expires_at = ? WHERE id = ?`);
    shift.run(Date.now() - 1000, created.id);
    expect(store.purgeExpired()).toBe(1);
  });

  it("rejects invalid stored payloads", () => {
    expect(() => store.createArtifact("not-a-payload")).toThrow();
  });
});
