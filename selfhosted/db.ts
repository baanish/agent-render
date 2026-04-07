import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { computeExpiresAt, isExpired } from "./ttl.js";

/** Row shape returned by artifact queries. */
export interface ArtifactRow {
  id: string;
  payload: string;
  created_at: string;
  updated_at: string;
  last_viewed_at: string;
  expires_at: string;
}

let db: Database.Database | null = null;

/**
 * Open (or return the existing) SQLite database connection and ensure the
 * artifacts table and indexes exist.
 *
 * Creates the parent directory for `dbPath` when it does not exist.
 *
 * @param dbPath - File path for the SQLite database. Defaults to `./data/agent-render.db`.
 * @returns The active `better-sqlite3` database instance.
 */
export function getDb(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath ?? process.env.DB_PATH ?? "./data/agent-render.db";
  mkdirSync(dirname(resolvedPath), { recursive: true });

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at);
  `);

  return db;
}

/**
 * Close the current database connection, if open.
 *
 * Primarily useful in tests to ensure a clean state between runs.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Insert a new artifact with a UUID v4 identifier and 24-hour TTL.
 *
 * @param payload - The agent-render payload string to store.
 * @returns The generated UUID and the computed expiration timestamp.
 */
export function createArtifact(payload: string): { id: string; expires_at: string } {
  const id = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = computeExpiresAt();

  getDb()
    .prepare(
      `INSERT INTO artifacts (id, payload, created_at, updated_at, last_viewed_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, payload, now, now, now, expiresAt);

  return { id, expires_at: expiresAt };
}

/**
 * Look up an artifact by ID and refresh its sliding TTL on success.
 *
 * Returns `null` when the artifact does not exist or has expired.
 * Expired rows are lazily deleted on read.
 *
 * @param id - UUID of the artifact to retrieve.
 * @returns The full artifact row with a refreshed `expires_at`, or `null`.
 */
export function getArtifact(id: string): ArtifactRow | null {
  const row = getDb()
    .prepare("SELECT * FROM artifacts WHERE id = ?")
    .get(id) as ArtifactRow | undefined;

  if (!row) return null;

  if (isExpired(row.expires_at)) {
    getDb().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    return null;
  }

  const now = new Date().toISOString();
  const newExpiresAt = computeExpiresAt();

  getDb()
    .prepare(
      `UPDATE artifacts SET last_viewed_at = ?, expires_at = ?, updated_at = ? WHERE id = ?`,
    )
    .run(now, newExpiresAt, now, id);

  return { ...row, last_viewed_at: now, expires_at: newExpiresAt, updated_at: now };
}

/**
 * Replace the payload for an existing, non-expired artifact.
 *
 * Refreshes `updated_at` and extends the TTL. Returns the updated row,
 * or `null` when the artifact does not exist or has expired.
 *
 * @param id - UUID of the artifact to update.
 * @param payload - New payload string to store.
 */
export function updateArtifact(id: string, payload: string): ArtifactRow | null {
  const row = getDb()
    .prepare("SELECT * FROM artifacts WHERE id = ?")
    .get(id) as ArtifactRow | undefined;

  if (!row) return null;

  if (isExpired(row.expires_at)) {
    getDb().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    return null;
  }

  const now = new Date().toISOString();
  const newExpiresAt = computeExpiresAt();

  getDb()
    .prepare(
      `UPDATE artifacts SET payload = ?, updated_at = ?, expires_at = ? WHERE id = ?`,
    )
    .run(payload, now, newExpiresAt, id);

  return { ...row, payload, updated_at: now, expires_at: newExpiresAt };
}

/**
 * Delete an artifact by ID regardless of expiry state.
 *
 * @param id - UUID of the artifact to delete.
 * @returns `true` when a row was deleted, `false` otherwise.
 */
export function deleteArtifact(id: string): boolean {
  const result = getDb().prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Remove all artifacts whose `expires_at` timestamp is in the past.
 *
 * Can be called periodically or on demand to reclaim storage.
 *
 * @returns The number of rows deleted.
 */
export function cleanupExpired(): number {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare("DELETE FROM artifacts WHERE expires_at <= ?")
    .run(now);
  return result.changes;
}
