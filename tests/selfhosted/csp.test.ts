// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Pins the self-hosted viewer's Content-Security-Policy contract. The server self-derives script-src
// sha256 hashes from its own index.html's inline scripts and mints a per-response nonce for the
// injected payload bootstrap, so a stored payload cannot execute attacker-controlled inline script
// even if a renderer regressed. A fixture index.html with KNOWN inline scripts lets the test assert
// the EXACT hashes. (That the real viewer renders under this CSP is verified out-of-band with a
// headless-browser probe; this test pins the header/nonce wiring deterministically.)

const repoRoot = process.cwd();

// Two inline scripts (hashable) + one external (must NOT be hashed).
const INLINE_A = 'console.log("hydrate a");';
const INLINE_B = "window.__t=1;";
const INDEX_HTML =
  `<!doctype html><html><head><title>t</title>` +
  `<script>${INLINE_A}</script><script src="/app.js"></script>` +
  `</head><body><div id="root"></div><script>${INLINE_B}</script></body></html>`;

function sha256Source(body: string): string {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}
const EXPECTED_HASHES = [sha256Source(INLINE_A), sha256Source(INLINE_B)];

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a local test port."));
      });
    });
  });
}

function createFixture(): { root: string; outDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), "agent-render-csp-"));
  const outDir = path.join(root, "out");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "index.html"), INDEX_HTML);
  writeFileSync(path.join(outDir, "app.js"), "export const x = 1;\n");
  return { root, outDir };
}

async function waitForReady(url: string, child: ChildProcess): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.status !== 404) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError instanceof Error ? lastError : new Error(`Server did not respond at ${url}.`);
}

function nonceFromCsp(csp: string): string | null {
  return csp.match(/'nonce-([^']+)'/)?.[1] ?? null;
}

describe("selfhosted Content-Security-Policy", () => {
  let fixture: { root: string; outDir: string };
  let child: ChildProcess;
  let base: string;

  beforeAll(async () => {
    fixture = createFixture();
    const port = await getFreePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, "selfhosted", "server.ts")], {
      cwd: repoRoot,
      env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", OUT_DIR: fixture.outDir, DB_PATH: path.join(fixture.root, "db.sqlite") },
      stdio: "ignore",
    });
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

  async function createArtifact(): Promise<string> {
    const res = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "phello" }),
    });
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it("locks down script-src with self-derived hashes + a nonce on the injected viewer", async () => {
    const id = await createArtifact();
    const res = await fetch(`${base}/${id}`);
    expect(res.status).toBe(200);

    const csp = res.headers.get("content-security-policy") ?? "";
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "";

    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'nonce-");
    // Exactly the two inline scripts are hashed; the external `src` script is not.
    for (const hash of EXPECTED_HASHES) expect(scriptSrc).toContain(hash);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // `'wasm-unsafe-eval'` is required for the arx-family brotli-wasm decode and must NOT be the
    // broader `'unsafe-eval'`. (The `'wasm-` prefix means the `'unsafe-eval'` token is absent.)
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("ties the CSP nonce to the injected payload script tag", async () => {
    const id = await createArtifact();
    const res = await fetch(`${base}/${id}`);
    const csp = res.headers.get("content-security-policy") ?? "";
    const body = await res.text();

    const headerNonce = nonceFromCsp(csp);
    const scriptNonce = body.match(/<script nonce="([^"]+)">window\.__AGENT_RENDER_PAYLOAD__/)?.[1] ?? null;
    expect(headerNonce).toBeTruthy();
    expect(scriptNonce).toBe(headerNonce);
  });

  it("mints a fresh nonce per response", async () => {
    const id = await createArtifact();
    const a = nonceFromCsp((await fetch(`${base}/${id}`)).headers.get("content-security-policy") ?? "");
    const b = nonceFromCsp((await fetch(`${base}/${id}`)).headers.get("content-security-policy") ?? "");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("serves the static app shell with the hashed CSP but no nonce", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    for (const hash of EXPECTED_HASHES) expect(csp).toContain(hash);
    expect(csp).not.toContain("'nonce-");
  });

  it("does not attach a CSP to non-HTML static assets", async () => {
    const res = await fetch(`${base}/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBeNull();
  });
});
