// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pins the self-hosted server's runtime lifecycle contract: a /health endpoint that pings the
// database, and a graceful SIGTERM shutdown that exits 0 promptly (well under the 5s force-exit
// fallback) instead of being hard-killed. The server self-executes on import (getDb + server.listen),
// so it is exercised over an ephemeral port in a spawned child rather than imported directly.

const repoRoot = process.cwd();

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
  const root = mkdtempSync(path.join(tmpdir(), "agent-render-lifecycle-"));
  const outDir = path.join(root, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), "<!doctype html><title>agent-render</title>");
  return { root, outDir };
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
        DB_PATH: path.join(fixture.root, "agent-render.db"),
      },
      stdio: "ignore",
    },
  );
}

async function waitForHealth(baseUrl: string, child: ChildProcess): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) {
      break;
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Self-hosted server did not become healthy at ${baseUrl}.`);
}

describe("selfhosted /health endpoint", () => {
  let fixture: { root: string; outDir: string };
  let child: ChildProcess;
  let port: number;

  beforeAll(async () => {
    fixture = createFixture();
    port = await getFreePort();
    child = spawnServer(port, fixture);
    await waitForHealth(`http://127.0.0.1:${port}`, child);
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

  it("reports ok when the database is reachable", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe("selfhosted graceful shutdown", () => {
  it(
    "exits cleanly and promptly on SIGTERM",
    async () => {
      const fixture = createFixture();
      const port = await getFreePort();
      const child = spawnServer(port, fixture);

      try {
        await waitForHealth(`http://127.0.0.1:${port}`, child);

        const result = await new Promise<{ code: number | null; elapsedMs: number }>((resolve) => {
          const startedAt = Date.now();
          child.once("exit", (code) => resolve({ code, elapsedMs: Date.now() - startedAt }));
          child.kill("SIGTERM");
        });

        expect(result.code).toBe(0);
        // Below the 5s force-exit fallback: proves server.close() drained and the WAL checkpoint ran,
        // rather than the process being force-killed by the timeout.
        expect(result.elapsedMs).toBeLessThan(4500);
      } finally {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    15000,
  );
});
