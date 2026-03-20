import Database from "better-sqlite3";
import path from "node:path";

/** Default path for the SQLite database file, overridable via ARTIFACTS_DB_PATH env var. */
const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "artifacts.db");

let _db: Database.Database | null = null;

/**
 * Return the singleton SQLite database instance, creating the artifacts table and indexes on first call.
 *
 * The database file path is read from `ARTIFACTS_DB_PATH` (falls back to `./data/artifacts.db`).
 * WAL journal mode and NORMAL synchronous are enabled for better concurrent read performance.
 *
 * @returns The initialized `better-sqlite3` database handle.
 */
export function getDb(): Database.Database {
  if (_db) {
    return _db;
  }

  const dbPath = process.env.ARTIFACTS_DB_PATH ?? DEFAULT_DB_PATH;

  const dir = path.dirname(dbPath);
  const fs = require("node:fs") as typeof import("node:fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL DEFAULT (datetime('now', '+24 hours'))
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts(expires_at);
  `);

  return _db;
}

/** Row shape as returned from SQLite (dates stored as ISO strings). */
export interface ArtifactRow {
  id: string;
  payload: string;
  created_at: string;
  updated_at: string;
  last_viewed_at: string;
  expires_at: string;
}
