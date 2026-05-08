import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const apiCatalogLink = '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"';

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

function createExportFixture(): { root: string; outDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), "agent-render-api-catalog-"));
  const outDir = path.join(root, "out");
  mkdirSync(path.join(outDir, ".well-known"), { recursive: true });
  mkdirSync(path.join(outDir, "openapi"), { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), "<!doctype html><title>agent-render</title>");
  writeFileSync(path.join(outDir, ".well-known", "api-catalog"), readFileSync(path.resolve("public", ".well-known", "api-catalog")));
  writeFileSync(path.join(outDir, "openapi", "selfhosted-artifacts.yaml"), readFileSync(path.resolve("public", "openapi", "selfhosted-artifacts.yaml")));
  return { root, outDir };
}

async function waitForHead(url: string, child: ChildProcess): Promise<Response> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) {
      break;
    }

    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.status !== 404) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw lastError instanceof Error ? lastError : new Error(`Server did not respond to ${url}.`);
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

describe("RFC 9727 api-catalog", () => {
  it("advertises the optional self-hosted API endpoint and description", () => {
    const catalogPath = path.resolve("public", ".well-known", "api-catalog");
    const raw = readFileSync(catalogPath, "utf8");
    const doc = JSON.parse(raw) as {
      linkset: Array<Record<string, unknown>>;
    };

    expect(Array.isArray(doc.linkset)).toBe(true);
    expect(doc.linkset).toHaveLength(2);

    const catalogEntry = doc.linkset[0];
    expect(catalogEntry.anchor).toBe("/.well-known/api-catalog");
    expect(Object.keys(catalogEntry).sort()).toEqual(["anchor", "item"]);
    expect(catalogEntry.item).toEqual([{ href: "/api/artifacts" }]);

    const apiEntry = doc.linkset[1];
    expect(apiEntry.anchor).toBe("/api/artifacts");
    expect(Object.keys(apiEntry).sort()).toEqual(["anchor", "service-desc"]);

    const serviceDesc = apiEntry["service-desc"] as Array<{ href: string; type: string }>;
    expect(serviceDesc).toEqual([
      {
        href: "/openapi/selfhosted-artifacts.yaml",
        type: "application/yaml",
      },
    ]);
  });

  it("serves HEAD discovery headers from the static export preview server", async () => {
    const fixture = createExportFixture();
    const port = await getFreePort();
    const child = spawn(process.execPath, [path.join(repoRoot, "scripts", "serve-export.mjs")], {
      cwd: fixture.root,
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    });

    try {
      const response = await waitForHead(`http://127.0.0.1:${port}/.well-known/api-catalog`, child);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/linkset+json");
      expect(response.headers.get("link")).toBe(apiCatalogLink);
    } finally {
      await stopServer(child);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("serves HEAD discovery headers from the self-hosted server", async () => {
    const fixture = createExportFixture();
    const port = await getFreePort();
    const child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, "selfhosted", "server.ts")], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        OUT_DIR: fixture.outDir,
        DB_PATH: path.join(fixture.root, "agent-render.db"),
      },
      stdio: "ignore",
    });

    try {
      const response = await waitForHead(`http://127.0.0.1:${port}/.well-known/api-catalog`, child);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/linkset+json");
      expect(response.headers.get("link")).toBe(apiCatalogLink);
    } finally {
      await stopServer(child);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
