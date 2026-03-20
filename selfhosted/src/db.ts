import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";

export type ArtifactRow = {
  id: string;
  payload: string;
  created_at: string;
  updated_at: string;
  last_viewed_at: string | null;
  expires_at: string;
};

const TTL_HOURS = parseInt(process.env.TTL_HOURS ?? "24", 10);
const TTL_MODIFIER = `+${TTL_HOURS} hours`;

let db: Database.Database;

/** Initializes the SQLite database connection and creates the artifacts table if needed. */
export function initDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.DB_PATH ?? "./data/agent-render.db";
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_viewed_at TEXT,
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '${TTL_MODIFIER}'))
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at)
  `);

  return db;
}

/** Returns the active database instance. Throws if initDb has not been called. */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

/** Creates a new artifact with a UUID v4 id and returns the row. */
export function createArtifact(payload: string): ArtifactRow {
  const id = randomUUID();
  const stmt = getDb().prepare(`
    INSERT INTO artifacts (id, payload, created_at, updated_at, expires_at)
    VALUES (?, ?, datetime('now'), datetime('now'), datetime('now', ?))
  `);
  stmt.run(id, payload, TTL_MODIFIER);
  return getArtifact(id)!;
}

/**
 * Retrieves an artifact by id if it has not expired.
 * Extends the TTL by refreshing expires_at on each successful read (sliding window).
 */
export function getArtifact(id: string): ArtifactRow | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM artifacts WHERE id = ? AND expires_at > datetime('now')`
    )
    .get(id) as ArtifactRow | undefined;

  if (!row) return null;

  getDb()
    .prepare(
      `UPDATE artifacts SET last_viewed_at = datetime('now'), expires_at = datetime('now', ?) WHERE id = ?`
    )
    .run(TTL_MODIFIER, id);

  return row;
}

/**
 * Retrieves an artifact by id without extending TTL.
 * Used for the API GET endpoint where TTL refresh is separate from the viewer route.
 */
export function getArtifactRaw(id: string): ArtifactRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT * FROM artifacts WHERE id = ? AND expires_at > datetime('now')`
      )
      .get(id) as ArtifactRow | undefined) ?? null
  );
}

/** Refreshes the TTL for an artifact (sliding window). */
export function refreshArtifactTtl(id: string): void {
  getDb()
    .prepare(
      `UPDATE artifacts SET last_viewed_at = datetime('now'), expires_at = datetime('now', ?) WHERE id = ?`
    )
    .run(TTL_MODIFIER, id);
}

/** Updates the payload of an existing artifact and resets its TTL. */
export function updateArtifact(
  id: string,
  payload: string
): ArtifactRow | null {
  const existing = getArtifactRaw(id);
  if (!existing) return null;

  getDb()
    .prepare(
      `UPDATE artifacts SET payload = ?, updated_at = datetime('now'), expires_at = datetime('now', ?) WHERE id = ?`
    )
    .run(payload, TTL_MODIFIER, id);

  return getArtifactRaw(id);
}

/** Deletes an artifact by id. Returns true if a row was deleted. */
export function deleteArtifact(id: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM artifacts WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

/** Removes all expired artifacts from the database. Returns the number of rows deleted. */
export function cleanupExpired(): number {
  const result = getDb()
    .prepare(`DELETE FROM artifacts WHERE expires_at <= datetime('now')`)
    .run();
  return result.changes;
}

/** Closes the database connection. */
export function closeDb(): void {
  if (db) {
    db.close();
  }
}
