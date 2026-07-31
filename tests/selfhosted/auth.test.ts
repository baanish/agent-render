// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const password = "correct horse battery staple";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a test port."));
      });
    });
  });
}

function fixture(): { root: string; outDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), "agent-render-auth-"));
  const outDir = path.join(root, "out");
  mkdirSync(path.join(outDir, "security"), { recursive: true });
  writeFileSync(
    path.join(outDir, "index.html"),
    "<!doctype html><html><head><title>Home</title></head><body></body></html>",
  );
  writeFileSync(path.join(outDir, "security", "index.html"), "<!doctype html><title>Security</title>");
  writeFileSync(path.join(outDir, "app.js"), "globalThis.loaded = true;");
  return { root, outDir };
}

function startServer(
  port: number,
  files: { root: string; outDir: string },
  configuredPassword?: string,
  extraEnv?: Record<string, string>,
): ChildProcess {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    OUT_DIR: files.outDir,
    DB_PATH: path.join(files.root, "agent-render.db"),
    ...extraEnv,
  };
  if (configuredPassword === undefined) delete env.AGENT_RENDER_PASSWORD;
  else env.AGENT_RENDER_PASSWORD = configuredPassword;

  return spawn(
    process.execPath,
    ["--import", "tsx", path.join(repoRoot, "selfhosted", "server.ts")],
    { cwd: repoRoot, env, stdio: "ignore" },
  );
}

async function waitForHealth(base: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {
      // Retry until the child starts listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Self-hosted server did not become healthy.");
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("close", () => resolve());
    child.kill();
  });
}

async function createArtifact(base: string, authorization: string): Promise<string> {
  const response = await fetch(`${base}/api/artifacts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body: JSON.stringify({ payload: "pauth-test" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

describe("optional self-hosted password gate", () => {
  let files: { root: string; outDir: string };
  let child: ChildProcess;
  let base: string;
  let cookie: string;

  beforeAll(async () => {
    files = fixture();
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = startServer(port, files, password);
    await waitForHealth(base, child);

    const login = await fetch(`${base}/auth`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password, redirect: "/security?from=login" }),
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    cookie = setCookie.split(";", 1)[0];
  });

  afterAll(async () => {
    await stopServer(child);
    rmSync(files.root, { recursive: true, force: true });
  });

  it("leaves health open but gates GET artifact API reads", async () => {
    await expect((await fetch(`${base}/health`)).json()).resolves.toEqual({ status: "ok" });
    const id = await createArtifact(base, `Bearer ${password}`);

    // An open API read would let anyone with a link bypass the page cookie gate.
    const unauthenticated = await fetch(`${base}/api/artifacts/${id}`);
    expect(unauthenticated.status).toBe(401);

    const withBearer = await fetch(`${base}/api/artifacts/${id}`, {
      headers: { Authorization: `Bearer ${password}` },
    });
    expect(withBearer.status).toBe(200);
    await expect(withBearer.json()).resolves.toMatchObject({ id, payload: "pauth-test" });

    const withCookie = await fetch(`${base}/api/artifacts/${id}`, { headers: { cookie } });
    expect(withCookie.status).toBe(200);
  });

  it("rejects missing and incorrect credentials on mutating API routes", async () => {
    const missing = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: "pdenied" }),
    });
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");
    await expect(missing.json()).resolves.toEqual({ error: "Unauthorized." });

    const wrong = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: { Authorization: "Bearer wrong" },
    });
    expect(wrong.status).toBe(401);
  });

  it("accepts bearer auth for create, update, delete, and cleanup", async () => {
    const authorization = `Bearer ${password}`;
    const id = await createArtifact(base, authorization);
    const updated = await fetch(`${base}/api/artifacts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: authorization },
      body: JSON.stringify({ payload: "pupdated" }),
    });
    expect(updated.status).toBe(200);

    const deleted = await fetch(`${base}/api/artifacts/${id}`, {
      method: "DELETE",
      headers: { Authorization: authorization },
    });
    expect(deleted.status).toBe(200);

    const cleaned = await fetch(`${base}/api/cleanup`, {
      method: "POST",
      headers: { Authorization: authorization },
    });
    expect(cleaned.status).toBe(200);
  });

  it("accepts the auth cookie on mutating API routes and CORS permits Authorization", async () => {
    const created = await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ payload: "pcookie" }),
    });
    expect(created.status).toBe(201);

    const preflight = await fetch(`${base}/api/artifacts`, { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
  });

  it("serves a password form for UUID and exported HTML pages but leaves assets open", async () => {
    const id = await createArtifact(base, `Bearer ${password}`);
    const uuid = await fetch(`${base}/${id}`);
    expect(uuid.status).toBe(401);
    expect(await uuid.text()).toContain('<form method="post" action="/auth">');

    const authenticatedUuid = await fetch(`${base}/${id}`, { headers: { Cookie: cookie } });
    expect(authenticatedUuid.status).toBe(200);
    expect(await authenticatedUuid.text()).toContain(
      'window.__AGENT_RENDER_PAYLOAD__="pauth-test"',
    );

    const exported = await fetch(`${base}/security?next=%22test%22`);
    expect(exported.status).toBe(401);
    const form = await exported.text();
    expect(form).toContain("Sign in to agent-render");
    expect(form).toContain("/security?next=%22test%22");

    const asset = await fetch(`${base}/app.js`);
    expect(asset.status).toBe(200);
  });

  it("sets a persistent restart-scoped HMAC cookie and redirects to a safe local path", async () => {
    const login = await fetch(`${base}/auth`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password, redirect: "/security?from=login" }),
    });
    expect(login.status).toBe(303);
    expect(login.headers.get("location")).toBe("/security?from=login");
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("agent_render_auth=");
    expect(setCookie).not.toContain(password);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=31536000");
    // Over plain HTTP the cookie must not be Secure, or the browser drops it and login loops.
    expect(setCookie).not.toContain("Secure");

    const page = await fetch(`${base}/security`, { headers: { Cookie: cookie } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>Security</title>");
  });

  it("ignores X-Forwarded-Proto unless the proxy is trusted", async () => {
    // Default deployment does not trust the header, so a forged https scheme must not add Secure.
    const login = await fetch(`${base}/auth`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Forwarded-Proto": "https",
      },
      body: new URLSearchParams({ password, redirect: "/" }),
    });
    expect(login.status).toBe(303);
    expect(login.headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  it("rejects a wrong form password and will not redirect off-origin", async () => {
    const wrong = await fetch(`${base}/auth`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password: "wrong", redirect: "/security" }),
    });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("Incorrect password.");

    const unsafe = await fetch(`${base}/auth`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ password, redirect: "//example.com/stolen" }),
    });
    expect(unsafe.status).toBe(303);
    expect(unsafe.headers.get("location")).toBe("/");
  });
});

describe("self-hosted server without a password", () => {
  it("preserves open browser and mutating API behavior", async () => {
    const files = fixture();
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = startServer(port, files);
    try {
      await waitForHealth(base, child);
      expect((await fetch(`${base}/`)).status).toBe(200);
      const created = await fetch(`${base}/api/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: "popen" }),
      });
      expect(created.status).toBe(201);
    } finally {
      await stopServer(child);
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});

describe("self-hosted server with an empty password", () => {
  it("refuses to start when AGENT_RENDER_PASSWORD is set but empty", async () => {
    // `AGENT_RENDER_PASSWORD=${SECRET}` with SECRET missing expands to empty. Starting wide open
    // there would leave an operator who explicitly configured auth with none, so it must fail loudly
    // rather than be read as "auth off" (which is what an unset variable means).
    const files = fixture();
    const port = await freePort();
    const child = startServer(port, files, "");
    try {
      const exitCode = await new Promise<number | null>((resolve) => {
        child.once("close", (code) => resolve(code));
      });
      expect(exitCode).not.toBe(0);
    } finally {
      await stopServer(child);
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});

describe("self-hosted auth rate limiting", () => {
  it("refuses further attempts before the KDF once the budget is spent", async () => {
    const files = fixture();
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = startServer(port, files, "correct horse battery staple");
    try {
      await waitForHealth(base, child);

      let sawRateLimit = false;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const response = await fetch(`${base}/api/artifacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer wrong-${attempt}` },
          body: JSON.stringify({ payload: "pnope" }),
        });
        if (response.status === 429) {
          expect(response.headers.get("retry-after")).toBeTruthy();
          sawRateLimit = true;
          break;
        }
        expect(response.status).toBe(401);
      }
      expect(sawRateLimit).toBe(true);
    } finally {
      await stopServer(child);
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});

describe("self-hosted server with an unusable password", () => {
  it("fails fast when AGENT_RENDER_PASSWORD exceeds the candidate length bound", async () => {
    const files = fixture();
    const port = await freePort();
    // A password longer than the per-request bound would start cleanly and then reject every
    // correct login, so startup must fail instead.
    const child = startServer(port, files, "p".repeat(257));
    try {
      const exitCode = await new Promise<number | null>((resolve) => {
        child.once("close", (code) => resolve(code));
      });
      expect(exitCode).not.toBe(0);
    } finally {
      await stopServer(child);
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});

describe("self-hosted server with a trusted proxy", () => {
  it("honors X-Forwarded-Proto=https for the Secure cookie flag", async () => {
    const files = fixture();
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    const child = startServer(port, files, "correct horse battery staple", {
      AGENT_RENDER_TRUST_PROXY: "1",
    });
    try {
      await waitForHealth(base, child);
      const login = await fetch(`${base}/auth`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Forwarded-Proto": "https",
        },
        body: new URLSearchParams({ password: "correct horse battery staple", redirect: "/" }),
      });
      expect(login.status).toBe(303);
      expect(login.headers.get("set-cookie") ?? "").toContain("Secure");
    } finally {
      await stopServer(child);
      rmSync(files.root, { recursive: true, force: true });
    }
  });
});
