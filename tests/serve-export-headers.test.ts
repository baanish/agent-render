// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pins the precompressed (.br) header contract served by scripts/serve-export.mjs:
// a request for a Brotli-precompressed asset must advertise the DECOMPRESSED
// Content-Type (application/json / text/css, never application/octet-stream),
// Content-Encoding: br, and Vary: Accept-Encoding, while _next/static assets
// stay immutably cacheable. The preview server self-executes on import
// (collectStaticFiles + server.listen), so it is exercised over an ephemeral
// port instead of importing its helpers directly.

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

function createExportFixture(): { root: string } {
  const root = mkdtempSync(path.join(tmpdir(), "agent-render-serve-headers-"));
  const outDir = path.join(root, "out");
  mkdirSync(path.join(outDir, "_next", "static", "chunks"), { recursive: true });
  mkdirSync(path.join(outDir, "vendor"), { recursive: true });
  writeFileSync(
    path.join(outDir, "index.html"),
    "<!doctype html><title>agent-render</title>",
  );
  writeFileSync(
    path.join(outDir, "_next", "static", "chunks", "brotli.wasm"),
    "wasm",
  );
  writeFileSync(
    path.join(outDir, "arx-dictionary.json.br"),
    "brotli-compressed-json",
  );
  writeFileSync(
    path.join(outDir, "vendor", "diff-view-pure.css.br"),
    "brotli-compressed-css",
  );
  return { root };
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
    : new Error(`Preview server did not respond at ${url}.`);
}

function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once("close", () => resolve());
    child.kill();
  });
}

describe("serve-export precompressed header contract", () => {
  let fixture: { root: string };
  let child: ChildProcess;
  let port: number;

  beforeAll(async () => {
    fixture = createExportFixture();
    port = await getFreePort();
    child = spawn(
      process.execPath,
      [path.join(repoRoot, "scripts", "serve-export.mjs")],
      {
        cwd: fixture.root,
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
      },
    );
    await waitForReady(`http://127.0.0.1:${port}/index.html`, child);
  });

  afterAll(async () => {
    await stopServer(child);
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("serves *.json.br with decompressed Content-Type and Brotli headers", async () => {
    const response = await fetch(
      `http://127.0.0.1:${port}/arx-dictionary.json.br`,
      { method: "HEAD" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
  });

  it("serves *.css.br with decompressed Content-Type and Brotli headers", async () => {
    const response = await fetch(
      `http://127.0.0.1:${port}/vendor/diff-view-pure.css.br`,
      { method: "HEAD" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/css; charset=utf-8",
    );
    expect(response.headers.get("content-encoding")).toBe("br");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
  });

  it("marks _next/static assets immutably cacheable", async () => {
    const response = await fetch(
      `http://127.0.0.1:${port}/_next/static/chunks/brotli.wasm`,
      { method: "HEAD" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});
