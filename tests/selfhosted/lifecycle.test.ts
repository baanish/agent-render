// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pins the self-hosted server's runtime lifecycle contract: a /health endpoint that pings the
// database; a graceful SIGTERM shutdown that exits 0 promptly; durability of a stored artifact across
// a clean shutdown + restart; and the forced-shutdown path (connections that do not drain within the
// grace window cause a non-zero exit, distinct from a clean stop). The server self-executes on import
// (getDb + server.listen), so it is exercised over an ephemeral port in a spawned child.

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

function spawnServer(
  port: number,
  fixture: { root: string; outDir: string },
  extraEnv: Record<string, string> = {},
): ChildProcess {
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
        ...extraEnv,
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
        // An idle server has no connections to drain, so server.close() resolves immediately and the
        // handler exits 0 well under the 5s force-exit fallback — i.e. it took the graceful path, not
        // the forced timeout. (Data durability across this shutdown is pinned separately below; the
        // forced path's distinct non-zero exit is pinned by the test after that.)
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

describe("selfhosted shutdown durability", () => {
  it(
    "preserves a stored artifact across a graceful shutdown and restart",
    async () => {
      const fixture = createFixture();
      let child: ChildProcess | undefined;
      try {
        // First boot: store an artifact, then shut down gracefully.
        let port = await getFreePort();
        child = spawnServer(port, fixture);
        await waitForHealth(`http://127.0.0.1:${port}`, child);

        const created = await fetch(`http://127.0.0.1:${port}/api/artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: "pdurable" }),
        });
        expect(created.status).toBe(201);
        const { id } = (await created.json()) as { id: string };

        await new Promise<void>((resolve) => {
          child!.once("exit", () => resolve());
          child!.kill("SIGTERM");
        });

        // Second boot on the same DB_PATH: the artifact must still be there.
        port = await getFreePort();
        child = spawnServer(port, fixture);
        await waitForHealth(`http://127.0.0.1:${port}`, child);

        const fetched = await fetch(`http://127.0.0.1:${port}/api/artifacts/${id}`);
        expect(fetched.status).toBe(200);
        const row = (await fetched.json()) as { id: string; payload: string };
        expect(row.id).toBe(id);
        expect(row.payload).toBe("pdurable");
      } finally {
        if (child && child.exitCode === null) {
          await new Promise<void>((resolve) => {
            child!.once("close", () => resolve());
            child!.kill("SIGKILL");
          });
        }
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    20000,
  );
});

describe("selfhosted forced shutdown", () => {
  it(
    "exits non-zero when a connection cannot drain within the grace window",
    async () => {
      const fixture = createFixture();
      const port = await getFreePort();
      // Shorten the grace window so the forced path is exercised quickly.
      const child = spawnServer(port, fixture, { SHUTDOWN_GRACE_MS: "300" });
      let socket: net.Socket | undefined;

      try {
        await waitForHealth(`http://127.0.0.1:${port}`, child);

        // Open a request the server cannot finish: send headers declaring a body, then withhold it.
        // readBody() stays pending, so the connection is active (not idle) when SIGTERM arrives and
        // server.close() cannot drain it — forcing the timeout path.
        socket = net.connect(port, "127.0.0.1");
        await new Promise<void>((resolve, reject) => {
          socket!.once("error", reject);
          socket!.once("connect", () => resolve());
        });
        socket.write(
          "POST /api/artifacts HTTP/1.1\r\n" +
            "Host: 127.0.0.1\r\n" +
            "Content-Type: application/json\r\n" +
            "Content-Length: 200\r\n" +
            "\r\n" +
            '{"payload":"p', // far fewer than 200 bytes; the rest never arrives
        );
        // Give the server a moment to accept the request and enter readBody().
        await new Promise((resolve) => setTimeout(resolve, 150));

        const result = await new Promise<{ code: number | null; elapsedMs: number }>((resolve) => {
          const startedAt = Date.now();
          child.once("exit", (code) => resolve({ code, elapsedMs: Date.now() - startedAt }));
          child.kill("SIGTERM");
        });

        // Forced path: non-zero exit, and it waited out the (shortened) grace window rather than
        // exiting instantly via the graceful server.close() callback.
        expect(result.code).toBe(1);
        expect(result.elapsedMs).toBeGreaterThanOrEqual(250);
        expect(result.elapsedMs).toBeLessThan(5000);
      } finally {
        socket?.destroy();
        if (child.exitCode === null) {
          child.kill("SIGKILL");
        }
        rmSync(fixture.root, { recursive: true, force: true });
      }
    },
    15000,
  );
});
