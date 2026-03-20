import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export const PAYLOAD_FRAGMENT_KEY = "agent-render";
export const TTL_MS = 24 * 60 * 60 * 1000;
/** Stored wire string cap (characters), separate from the static fragment budget. */
export const MAX_STORED_WIRE_LENGTH = 5_000_000;

function assertValidPayloadString(payload) {
  if (typeof payload !== "string") {
    throw new TypeError("payload must be a string");
  }

  if (payload.length === 0 || payload.length > MAX_STORED_WIRE_LENGTH) {
    throw new RangeError(`payload length must be between 1 and ${MAX_STORED_WIRE_LENGTH}`);
  }

  if (!payload.startsWith(`${PAYLOAD_FRAGMENT_KEY}=v1.`)) {
    throw new Error(`payload must start with "${PAYLOAD_FRAGMENT_KEY}=v1."`);
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_viewed_at INTEGER,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts (expires_at);
  `);
}

/**
 * Opens the SQLite backing store and returns CRUD helpers used by the self-hosted HTTP server.
 *
 * @param {string} [databasePath=":memory:"] - Path on disk or ":memory:" for tests.
 * @returns {{ db: import("better-sqlite3").Database, createArtifact: Function, getArtifact: Function, updateArtifact: Function, deleteArtifact: Function, purgeExpired: Function }}
 */
export function openArtifactStore(databasePath = ":memory:") {
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  migrate(db);

  const insert = db.prepare(`
    INSERT INTO artifacts (id, payload, created_at, updated_at, last_viewed_at, expires_at)
    VALUES (@id, @payload, @created_at, @updated_at, @last_viewed_at, @expires_at)
  `);

  const selectById = db.prepare(`SELECT * FROM artifacts WHERE id = ?`);

  const touchView = db.prepare(`
    UPDATE artifacts
    SET last_viewed_at = @now, expires_at = @expires_at, updated_at = @now
    WHERE id = @id
  `);

  const updatePayload = db.prepare(`
    UPDATE artifacts
    SET payload = @payload, updated_at = @now, expires_at = @expires_at
    WHERE id = @id
  `);

  const deleteById = db.prepare(`DELETE FROM artifacts WHERE id = ?`);

  const deleteExpired = db.prepare(`DELETE FROM artifacts WHERE expires_at <= ?`);

  return {
    db,

    /**
     * @param {string} payload
     * @returns {{ id: string, createdAt: number, expiresAt: number }}
     */
    createArtifact(payload) {
      assertValidPayloadString(payload);
      const id = randomUUID();
      const now = Date.now();
      const expiresAt = now + TTL_MS;

      insert.run({
        id,
        payload,
        created_at: now,
        updated_at: now,
        last_viewed_at: null,
        expires_at: expiresAt,
      });

      return { id, createdAt: now, expiresAt };
    },

    /**
     * Returns artifact row after sliding TTL refresh, or a reason string.
     *
     * @param {string} id
     * @returns {{ ok: true, row: object } | { ok: false, reason: "not_found" | "expired" }}
     */
    getArtifact(id) {
      const now = Date.now();
      const row = selectById.get(id);

      if (!row) {
        return { ok: false, reason: "not_found" };
      }

      if (row.expires_at <= now) {
        deleteById.run(id);
        return { ok: false, reason: "expired" };
      }

      const nextExpires = now + TTL_MS;
      touchView.run({ id, now, expires_at: nextExpires });

      const refreshed = selectById.get(id);
      return { ok: true, row: refreshed };
    },

    /**
     * @param {string} id
     * @param {string} payload
     * @returns {{ ok: true, expiresAt: number } | { ok: false, reason: "not_found" | "expired" }}
     */
    updateArtifact(id, payload) {
      assertValidPayloadString(payload);
      const now = Date.now();
      const row = selectById.get(id);

      if (!row) {
        return { ok: false, reason: "not_found" };
      }

      if (row.expires_at <= now) {
        deleteById.run(id);
        return { ok: false, reason: "expired" };
      }

      const expiresAt = now + TTL_MS;
      updatePayload.run({ id, payload, now, expires_at: expiresAt });

      return { ok: true, expiresAt };
    },

    /**
     * @param {string} id
     * @returns {boolean}
     */
    deleteArtifact(id) {
      const result = deleteById.run(id);
      return result.changes > 0;
    },

    /** Deletes all rows at or past expiry. @returns {number} rows removed */
    purgeExpired() {
      const now = Date.now();
      const result = deleteExpired.run(now);
      return result.changes;
    },
  };
}
