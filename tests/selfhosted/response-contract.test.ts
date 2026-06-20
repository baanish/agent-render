// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pins the self-hosted server's response contract: conservative security headers on every response,
// and correct status codes for the create/update API (malformed input is a 400 client error; a
// well-formed request that fails to persist is a 500, not a masked 400). The server self-executes on
// import, so it is exercised over an ephemeral port in a spawned child rather than imported directly.

const repoRoot = process.cwd();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Could not allocate a local test port."));
        }
      });
    });
  });
}

function createFixture(): { root: string; outDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), "agent-render-response-"));
  const outDir = path.join(root, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), "<!doctype html><title>agent-render</title>");
  return { root, outDir };
}

async function waitForReady(url: string, child: ChildProcess): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) {
      break;
    }

    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.status !== 404) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Self-hosted server did not respond at ${url}.`);
}

function dbPathFor(fixture: { root: string }): string {
  return path.join(fixture.root, "agent-render.db");
}

function spawnServer(port: number, fixture: { root: string; outDir: string }): ChildProcess {
  return spawn(
    process.execPath,
    ["--import", "tsx", path.join(repoRoot, "selfhosted", "server.ts")],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        OUT_DIR: fixture.outDir,
        DB_PATH: dbPathFor(fixture),
      },
      stdio: "ignore",
    },
  );
}

describe("selfhosted response contract", () => {
  let fixture: { root: string; outDir: string };
  let child: ChildProcess;
  let port: number;
  let base: string;

  beforeAll(async () => {
    fixture = createFixture();
    port = await getFreePort();
    base = `http://127.0.0.1:${port}`;
    child = spawnServer(port, fixture);
    await waitForReady(`${base}/index.html`, child);
  });

  afterAll(async () => {
    if (child.exitCode === null) {
      await new Promise<void>((resolve) => {
        child.once("close", () => resolve());
        child.kill();
      });
    }
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("sets security headers on static responses", async () => {
    const response = await fetch(`${base}/index.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("sets security headers on API responses", async () => {
    const response = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "psecurity-headers" }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("creates an artifact for a well-formed request", async () => {
    const response = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "phello" }),
    });
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string; expires_at: string };
    expect(created.id).toMatch(UUID_RE);
    expect(typeof created.expires_at).toBe("string");
  });

  it("rejects a malformed JSON body with 400, not 500", async () => {
    const response = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects an empty payload with 400", async () => {
    const response = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a non-object JSON body (null) with 400, not 500", async () => {
    // `JSON.parse("null")` succeeds, so payload extraction must not throw on a non-object body. A
    // null body has no payload, so it lands on the validation 400 ("Payload must be a string."),
    // distinct from the parse 400 ("Invalid request body.").
    const response = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "null",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Payload must be a string." });
  });

  it("sets security headers on error responses too", async () => {
    // Headers are applied via setHeader() before routing, so they must persist through a writeHead
    // with its own header object — not just on the 200/201 happy paths.
    const response = await fetch(`${base}/api/artifacts/not-a-real-id`);
    expect(response.status).toBe(404);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});

// PR2's headline change splits a well-formed-but-unstorable request away from the parse-error 400 and
// into a 500. This exercises that path deterministically: after the server has opened its connection,
// a second connection drops the `artifacts` table, so the next INSERT/SELECT throws a SqliteError —
// the same failure class (e.g. SQLITE_FULL on disk-full) the 500 branch exists to handle. If this
// regresses to 400, the masking bug PR2 fixed is back.
describe("selfhosted persistence failure", () => {
  let fixture: { root: string; outDir: string };
  let child: ChildProcess;
  let port: number;
  let base: string;

  beforeAll(async () => {
    fixture = createFixture();
    port = await getFreePort();
    base = `http://127.0.0.1:${port}`;
    child = spawnServer(port, fixture);
    await waitForReady(`${base}/index.html`, child);

    // Confirm a write works first, then drop the table out from under the running server.
    const ok = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "pbefore-drop" }),
    });
    expect(ok.status).toBe(201);

    const db = new Database(dbPathFor(fixture));
    db.exec("DROP TABLE artifacts");
    db.close();
  });

  afterAll(async () => {
    if (child.exitCode === null) {
      await new Promise<void>((resolve) => {
        child.once("close", () => resolve());
        child.kill();
      });
    }
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("returns 500 when a create cannot be persisted", async () => {
    const response = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "pafter-drop" }),
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to store artifact." });
  });

  it("returns 500 when an update cannot be persisted", async () => {
    const response = await fetch(`${base}/api/artifacts/00000000-0000-4000-8000-000000000000`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "pafter-drop" }),
    });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to store artifact." });
  });
});
