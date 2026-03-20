import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SELFHOSTED_TTL_MS } from "./constants.ts";
import { isUuidV4, normalizeStoredPayloadString, validateStoredPayloadString } from "./stored-payload.ts";

export type StoredArtifactRecord = {
  id: string;
  payload: string;
  createdAt: string;
  updatedAt: string;
  lastViewedAt: string | null;
  expiresAt: string;
};

type ArtifactStoreOptions = {
  dbPath: string;
  ttlMs?: number;
  now?: () => number;
};

type StoreRow = {
  id: string;
  payload: string;
  created_at: string;
  updated_at: string;
  last_viewed_at: string | null;
  expires_at: string;
};

/**
 * SQLite-backed store for self-hosted agent-render payload strings keyed by UUID v4.
 *
 * The store persists the existing fragment payload string as-is, enforces 24-hour sliding TTL behavior,
 * and exposes create/read/update/delete/cleanup helpers used by the optional self-hosted HTTP server.
 */
export class SelfHostedArtifactStore {
  private readonly db: DatabaseSync;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: ArtifactStoreOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.db = new DatabaseSync(options.dbPath);
    this.ttlMs = options.ttlMs ?? SELFHOSTED_TTL_MS;
    this.now = options.now ?? (() => Date.now());
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_viewed_at TEXT,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_expires_at ON artifacts (expires_at);
      CREATE INDEX IF NOT EXISTS idx_artifacts_last_viewed_at ON artifacts (last_viewed_at);
    `);
  }

  /** Closes the underlying SQLite database connection. */
  close(): void {
    this.db.close();
  }

  /** Removes expired rows and returns the number of deleted artifacts. */
  cleanupExpired(): number {
    const result = this.db.prepare(`DELETE FROM artifacts WHERE expires_at <= ?`).run(this.toIso(this.now()));
    return Number(result.changes ?? 0);
  }

  /** Creates and stores a new payload string under a UUID v4 id. */
  async create(payload: string, providedId?: string): Promise<StoredArtifactRecord> {
    const id = providedId ?? randomUUID();
    if (!isUuidV4(id)) {
      throw new Error("Self-hosted artifact ids must be UUID v4 values.");
    }

    const validation = await validateStoredPayloadString(payload);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const nowIso = this.toIso(this.now());
    const record = {
      id,
      payload: normalizeStoredPayloadString(payload),
      createdAt: nowIso,
      updatedAt: nowIso,
      lastViewedAt: null,
      expiresAt: this.toIso(this.now() + this.ttlMs),
    } satisfies StoredArtifactRecord;

    this.db
      .prepare(
        `INSERT INTO artifacts (id, payload, created_at, updated_at, last_viewed_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.payload, record.createdAt, record.updatedAt, record.lastViewedAt, record.expiresAt);

    return record;
  }

  /** Reads a stored payload by id and optionally extends its sliding TTL on successful access. */
  getById(id: string, options: { refreshTtl?: boolean } = {}): StoredArtifactRecord | null {
    const row = this.selectById(id);
    if (!row) {
      return null;
    }

    if (Date.parse(row.expires_at) <= this.now()) {
      this.db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id);
      return null;
    }

    if (!options.refreshTtl) {
      return this.mapRow(row);
    }

    const viewedAt = this.toIso(this.now());
    const expiresAt = this.toIso(this.now() + this.ttlMs);
    this.db
      .prepare(`UPDATE artifacts SET last_viewed_at = ?, expires_at = ?, updated_at = ? WHERE id = ?`)
      .run(viewedAt, expiresAt, viewedAt, id);

    const refreshed = this.selectById(id);
    return refreshed ? this.mapRow(refreshed) : null;
  }

  /** Replaces the stored payload string for an existing UUID and resets its TTL window. */
  async update(id: string, payload: string): Promise<StoredArtifactRecord | null> {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const validation = await validateStoredPayloadString(payload);
    if (!validation.ok) {
      throw new Error(validation.message);
    }

    const updatedAt = this.toIso(this.now());
    const expiresAt = this.toIso(this.now() + this.ttlMs);
    this.db
      .prepare(`UPDATE artifacts SET payload = ?, updated_at = ?, expires_at = ? WHERE id = ?`)
      .run(normalizeStoredPayloadString(payload), updatedAt, expiresAt, id);

    return this.getById(id);
  }

  /** Deletes an artifact row by UUID and reports whether a row existed. */
  delete(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id);
    return Number(result.changes ?? 0) > 0;
  }

  private selectById(id: string): StoreRow | undefined {
    return this.db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id) as StoreRow | undefined;
  }

  private mapRow(row: StoreRow): StoredArtifactRecord {
    return {
      id: row.id,
      payload: row.payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastViewedAt: row.last_viewed_at,
      expiresAt: row.expires_at,
    };
  }

  private toIso(time: number): string {
    return new Date(time).toISOString();
  }
}
