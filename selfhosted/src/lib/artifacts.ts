import { getDb } from "./db";
import type { ArtifactRow } from "./db";

const TTL_HOURS = 24;

/**
 * Create a new artifact record in the database.
 *
 * @param id - UUID v4 identifier for the artifact.
 * @param payload - The canonical payload JSON string to store.
 * @returns The newly created row.
 */
export function createArtifact(id: string, payload: string): ArtifactRow {
  const db = getDb();
  db.prepare(
    `INSERT INTO artifacts (id, payload, created_at, updated_at, last_viewed_at, expires_at)
     VALUES (?, ?, datetime('now'), datetime('now'), datetime('now'), datetime('now', '+${TTL_HOURS} hours'))`,
  ).run(id, payload);

  return getArtifact(id)!;
}

/**
 * Retrieve an artifact by ID, returning `null` if it does not exist or has expired.
 *
 * On successful retrieval the `last_viewed_at` and `expires_at` fields are refreshed (sliding TTL).
 *
 * @param id - UUID v4 identifier.
 * @returns The artifact row, or `null` when not found / expired.
 */
export function getArtifact(id: string): ArtifactRow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM artifacts WHERE id = ?").get(id) as ArtifactRow | undefined;

  if (!row) {
    return null;
  }

  if (new Date(row.expires_at + "Z").getTime() < Date.now()) {
    db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
    return null;
  }

  db.prepare(
    `UPDATE artifacts SET last_viewed_at = datetime('now'), expires_at = datetime('now', '+${TTL_HOURS} hours') WHERE id = ?`,
  ).run(id);

  row.last_viewed_at = new Date().toISOString();
  row.expires_at = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000).toISOString();

  return row;
}

/**
 * Delete an artifact by ID.
 *
 * @param id - UUID v4 identifier.
 * @returns `true` if a row was deleted, `false` if it did not exist.
 */
export function deleteArtifact(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM artifacts WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * Update the payload of an existing artifact, refreshing its TTL.
 *
 * @param id - UUID v4 identifier.
 * @param payload - New canonical payload JSON string.
 * @returns The updated row, or `null` if the artifact does not exist.
 */
export function updateArtifact(id: string, payload: string): ArtifactRow | null {
  const db = getDb();
  const result = db.prepare(
    `UPDATE artifacts SET payload = ?, updated_at = datetime('now'), expires_at = datetime('now', '+${TTL_HOURS} hours') WHERE id = ?`,
  ).run(payload, id);

  if (result.changes === 0) {
    return null;
  }

  return getArtifact(id);
}

/**
 * Remove all expired artifact rows from the database.
 *
 * @returns The number of rows deleted.
 */
export function cleanupExpired(): number {
  const db = getDb();
  const result = db.prepare("DELETE FROM artifacts WHERE expires_at < datetime('now')").run();
  return result.changes;
}
