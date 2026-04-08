// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createArtifact, getArtifact, updateArtifact, deleteArtifact, cleanupExpired, getDb, closeDb } from "../../selfhosted/db.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "agent-render-test-"));
  process.env.DB_PATH = join(tempDir, "test.db");
  // Force a fresh connection
  closeDb();
  getDb();
});

afterEach(() => {
  closeDb();
  rmSync(tempDir, { recursive: true, force: true });
  delete process.env.DB_PATH;
});

const samplePayload = 'agent-render=v1.plain.eyJ2IjoxLCJjb2RlYyI6InBsYWluIiwiYXJ0aWZhY3RzIjpbeyJpZCI6InRlc3QiLCJraW5kIjoibWFya2Rvd24iLCJjb250ZW50IjoiIyBIZWxsbyJ9XX0';

describe("createArtifact", () => {
  it("returns a UUID and expiration timestamp", () => {
    const result = createArtifact(samplePayload);
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(new Date(result.expires_at).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("getArtifact", () => {
  it("returns the stored artifact", () => {
    const { id } = createArtifact(samplePayload);
    const row = getArtifact(id);
    expect(row).not.toBeNull();
    expect(row!.payload).toBe(samplePayload);
    expect(row!.id).toBe(id);
  });

  it("returns null for nonexistent id", () => {
    expect(getArtifact("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("refreshes expires_at on read", () => {
    const { id } = createArtifact(samplePayload);
    const first = getArtifact(id);
    expect(first).not.toBeNull();

    // Manually set expires_at to a known value then read again
    getDb().prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() + 1000).toISOString(),
      id,
    );

    const second = getArtifact(id);
    expect(second).not.toBeNull();
    // After refresh, expires_at should be ~24h from now, much later than the 1s we set
    const expiresMs = new Date(second!.expires_at).getTime();
    expect(expiresMs).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });

  it("returns null and deletes expired artifacts", () => {
    const { id } = createArtifact(samplePayload);
    // Set expires_at to the past
    getDb().prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      id,
    );

    expect(getArtifact(id)).toBeNull();

    // Verify it was deleted
    const row = getDb().prepare("SELECT * FROM artifacts WHERE id = ?").get(id);
    expect(row).toBeUndefined();
  });
});

describe("updateArtifact", () => {
  it("updates the payload", () => {
    const { id } = createArtifact(samplePayload);
    const newPayload = samplePayload + "-updated";
    const updated = updateArtifact(id, newPayload);
    expect(updated).not.toBeNull();
    expect(updated!.payload).toBe(newPayload);
  });

  it("returns null for nonexistent id", () => {
    expect(updateArtifact("00000000-0000-4000-8000-000000000000", "x")).toBeNull();
  });

  it("returns null for expired artifact", () => {
    const { id } = createArtifact(samplePayload);
    getDb().prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      id,
    );
    expect(updateArtifact(id, "x")).toBeNull();
  });
});

describe("deleteArtifact", () => {
  it("deletes an existing artifact", () => {
    const { id } = createArtifact(samplePayload);
    expect(deleteArtifact(id)).toBe(true);
    expect(getArtifact(id)).toBeNull();
  });

  it("returns false for nonexistent id", () => {
    expect(deleteArtifact("00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("cleanupExpired", () => {
  it("removes expired artifacts", () => {
    const { id: id1 } = createArtifact(samplePayload);
    const { id: id2 } = createArtifact(samplePayload);

    // Expire id1
    getDb().prepare("UPDATE artifacts SET expires_at = ? WHERE id = ?").run(
      new Date(Date.now() - 1000).toISOString(),
      id1,
    );

    const count = cleanupExpired();
    expect(count).toBe(1);

    // id2 should still exist
    expect(getArtifact(id2)).not.toBeNull();
    // id1 should be gone
    const row = getDb().prepare("SELECT * FROM artifacts WHERE id = ?").get(id1);
    expect(row).toBeUndefined();
  });
});
