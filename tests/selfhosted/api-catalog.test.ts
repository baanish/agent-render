import { readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const apiCatalogLink =
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"';

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
  mkdirSync(path.join(outDir, "_next", "static", "chunks"), {
    recursive: true,
  });
  mkdirSync(path.join(outDir, "openapi"), { recursive: true });
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
    path.join(outDir, "arx2-dictionary.json.br"),
    "brotli-compressed-json",
  );
  writeFileSync(
    path.join(outDir, "vendor", "diff-view-pure.css.br"),
    "brotli-compressed-css",
  );
  writeFileSync(
    path.join(outDir, ".well-known", "api-catalog"),
    readFileSync(path.resolve("public", ".well-known", "api-catalog")),
  );
  writeFileSync(
    path.join(outDir, "openapi", "selfhosted-artifacts.yaml"),
    readFileSync(
      path.resolve("public", "openapi", "selfhosted-artifacts.yaml"),
    ),
  );
  return { root, outDir };
}

function writeRoutesManifest(root: string, basePath: string) {
  const manifestDir = path.join(root, ".next");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    path.join(manifestDir, "routes-manifest.json"),
    JSON.stringify({ basePath }),
  );
}

async function waitForHead(
  url: string,
  child: ChildProcess,
): Promise<Response> {
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

  throw lastError instanceof Error
    ? lastError
    : new Error(`Server did not respond to ${url}.`);
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

async function rawHttpGet(
  port: number,
  requestPath: string,
): Promise<{ body: string; status: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(
        `GET ${requestPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`,
      );
    });

    socket.once("error", reject);
    socket.on("data", (chunk) => {
      chunks.push(chunk);
    });
    socket.once("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const [head = "", body = ""] = raw.split("\r\n\r\n");
      const status = Number(head.match(/^HTTP\/\d\.\d\s+(\d+)/)?.[1] ?? 0);
      resolve({ body, status });
    });
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

    const serviceDesc = apiEntry["service-desc"] as Array<{
      href: string;
      type: string;
    }>;
    expect(serviceDesc).toEqual([
      {
        href: "/openapi/selfhosted-artifacts.yaml",
        type: "application/yaml",
      },
    ]);
  });

  it("serves HEAD discovery headers from the static export preview server", async () => {
    const fixture = createExportFixture();
    writeFileSync(path.join(fixture.root, "secret.txt"), "outside-out");
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "scripts", "serve-export.mjs")],
      {
        cwd: fixture.root,
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
      },
    );

    try {
      const response = await waitForHead(
        `http://127.0.0.1:${port}/.well-known/api-catalog`,
        child,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/linkset+json",
      );
      expect(response.headers.get("link")).toBe(apiCatalogLink);

      const wasmResponse = await fetch(
        `http://127.0.0.1:${port}/_next/static/chunks/brotli.wasm`,
        { method: "HEAD" },
      );
      expect(wasmResponse.status).toBe(200);
      expect(wasmResponse.headers.get("content-type")).toBe("application/wasm");
      expect(wasmResponse.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );

      const compressedDictionaryResponse = await fetch(
        `http://127.0.0.1:${port}/arx-dictionary.json.br`,
        { method: "HEAD" },
      );
      expect(compressedDictionaryResponse.status).toBe(200);
      expect(compressedDictionaryResponse.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(compressedDictionaryResponse.headers.get("content-encoding")).toBe(
        "br",
      );
      expect(compressedDictionaryResponse.headers.get("vary")).toBe(
        "Accept-Encoding",
      );

      const compressedOverlayResponse = await fetch(
        `http://127.0.0.1:${port}/arx2-dictionary.json.br`,
        { method: "HEAD" },
      );
      expect(compressedOverlayResponse.status).toBe(200);
      expect(compressedOverlayResponse.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(compressedOverlayResponse.headers.get("content-encoding")).toBe(
        "br",
      );
      expect(compressedOverlayResponse.headers.get("vary")).toBe(
        "Accept-Encoding",
      );

      const compressedDiffStyleResponse = await fetch(
        `http://127.0.0.1:${port}/vendor/diff-view-pure.css.br`,
        { method: "HEAD" },
      );
      expect(compressedDiffStyleResponse.status).toBe(200);
      expect(compressedDiffStyleResponse.headers.get("content-type")).toBe(
        "text/css; charset=utf-8",
      );
      expect(compressedDiffStyleResponse.headers.get("content-encoding")).toBe(
        "br",
      );
      expect(compressedDiffStyleResponse.headers.get("vary")).toBe(
        "Accept-Encoding",
      );

      const escapeResponse = await rawHttpGet(port, "/../secret.txt");
      expect(escapeResponse.status).toBe(404);
      expect(escapeResponse.body).not.toContain("outside-out");
    } finally {
      await stopServer(child);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("auto-detects subpath static exports when preview env is not set", async () => {
    const fixture = createExportFixture();
    writeRoutesManifest(fixture.root, "/agent-render");
    const port = await getFreePort();
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "scripts", "serve-export.mjs")],
      {
        cwd: fixture.root,
        env: { ...process.env, PORT: String(port), NEXT_PUBLIC_BASE_PATH: "" },
        stdio: "ignore",
      },
    );

    try {
      const assetResponse = await waitForHead(
        `http://127.0.0.1:${port}/agent-render/_next/static/chunks/brotli.wasm`,
        child,
      );
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get("content-type")).toBe(
        "application/wasm",
      );

      const rootAssetResponse = await fetch(
        `http://127.0.0.1:${port}/_next/static/chunks/brotli.wasm`,
        { method: "HEAD" },
      );
      expect(rootAssetResponse.status).toBe(404);
    } finally {
      await stopServer(child);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("serves HEAD discovery headers from the self-hosted server", async () => {
    const fixture = createExportFixture();
    const port = await getFreePort();
    const child = spawn(
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

    try {
      const response = await waitForHead(
        `http://127.0.0.1:${port}/.well-known/api-catalog`,
        child,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/linkset+json",
      );
      expect(response.headers.get("link")).toBe(apiCatalogLink);

      const wasmResponse = await fetch(
        `http://127.0.0.1:${port}/_next/static/chunks/brotli.wasm`,
        { method: "HEAD" },
      );
      expect(wasmResponse.status).toBe(200);
      expect(wasmResponse.headers.get("content-type")).toBe("application/wasm");
      expect(wasmResponse.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );

      const compressedDictionaryResponse = await fetch(
        `http://127.0.0.1:${port}/arx-dictionary.json.br`,
        { method: "HEAD" },
      );
      expect(compressedDictionaryResponse.status).toBe(200);
      expect(compressedDictionaryResponse.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(compressedDictionaryResponse.headers.get("content-encoding")).toBe(
        "br",
      );
      expect(compressedDictionaryResponse.headers.get("vary")).toBe(
        "Accept-Encoding",
      );

      const compressedOverlayResponse = await fetch(
        `http://127.0.0.1:${port}/arx2-dictionary.json.br`,
        { method: "HEAD" },
      );
      expect(compressedOverlayResponse.status).toBe(200);
      expect(compressedOverlayResponse.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(compressedOverlayResponse.headers.get("content-encoding")).toBe(
        "br",
      );
      expect(compressedOverlayResponse.headers.get("vary")).toBe(
        "Accept-Encoding",
      );

      const compressedDiffStyleResponse = await fetch(
        `http://127.0.0.1:${port}/vendor/diff-view-pure.css.br`,
        { method: "HEAD" },
      );
      expect(compressedDiffStyleResponse.status).toBe(200);
      expect(compressedDiffStyleResponse.headers.get("content-type")).toBe(
        "text/css; charset=utf-8",
      );
      expect(compressedDiffStyleResponse.headers.get("content-encoding")).toBe(
        "br",
      );
      expect(compressedDiffStyleResponse.headers.get("vary")).toBe(
        "Accept-Encoding",
      );
    } finally {
      await stopServer(child);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
