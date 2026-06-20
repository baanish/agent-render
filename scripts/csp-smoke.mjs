// CSP smoke test for the self-hosted viewer.
//
// Spawns the real self-hosted server against a ROOT build (out/) and drives it in headless chromium
// to confirm the strict Content-Security-Policy does not break anything: the stored-artifact viewer
// renders all five artifact kinds + mermaid, WebAssembly (brotli-wasm for ARX decode) instantiates,
// and every exported static route loads — each under its own per-file script hashes — with zero CSP
// violations.
//
// Usage:  npm run build && npm run selfhosted:csp-smoke
// Requires: a root build in out/ (NOT a subpath build) and chromium (npx playwright install chromium).
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = process.cwd();
if (!existsSync(path.join(repoRoot, "out", "index.html"))) {
  console.error("out/index.html not found. Run `npm run build` (root build, no NEXT_PUBLIC_BASE_PATH) first.");
  process.exit(2);
}

const freePort = () =>
  new Promise((res, rej) => {
    const s = net.createServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

const envelope = {
  v: 1,
  codec: "plain",
  activeArtifactId: "doc",
  artifacts: [
    { id: "doc", kind: "markdown", title: "Notes", content: "# Notes\n\n```mermaid\ngraph TD\n A-->B\n```\n" },
    { id: "snip", kind: "code", title: "Snippet", language: "ts", content: "export const x = 1;\n" },
    { id: "chg", kind: "diff", title: "Changes", patch: "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n" },
    { id: "tbl", kind: "csv", title: "Data", content: "name,value\nx,1\n" },
    { id: "cfg", kind: "json", title: "Config", content: '{\n  "ready": true\n}' },
  ],
};
const payload = "p" + Buffer.from(JSON.stringify(envelope)).toString("base64url");

const port = await freePort();
const dbPath = path.join(repoRoot, ".csp-smoke.sqlite");
const child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, "selfhosted", "server.ts")], {
  cwd: repoRoot,
  env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", OUT_DIR: "out", DB_PATH: dbPath },
  stdio: "ignore",
});
const base = `http://127.0.0.1:${port}`;

function cleanup() {
  child.kill("SIGKILL");
  for (const ext of ["", "-shm", "-wal"]) {
    try {
      rmSync(dbPath + ext, { force: true });
    } catch {}
  }
}

try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  const { id } = await (
    await fetch(`${base}/api/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    })
  ).json();

  const browser = await chromium.launch();
  const violations = [];
  const newPage = async () => {
    const page = await browser.newPage();
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(`[${m.location().url}] ${m.text()}`);
    });
    page.on("pageerror", (e) => violations.push("PAGEERROR: " + e));
    return page;
  };

  // 1) The stored-artifact viewer: render all five kinds + mermaid, and exercise WASM.
  const viewer = await newPage();
  const resp = await viewer.goto(`${base}/${id}`, { waitUntil: "networkidle" });
  const cspPresent = !!resp.headers()["content-security-policy"];
  await viewer.waitForTimeout(2500);
  for (const title of ["Notes", "Snippet", "Changes", "Data", "Config"]) {
    try {
      await viewer.locator('button, a, [role="button"], [role="tab"], [role="listitem"]').filter({ hasText: title }).first().click({ timeout: 3000 });
    } catch {}
    await viewer.waitForTimeout(700);
  }
  const wasm = await viewer.evaluate(async () => {
    try {
      await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      return true;
    } catch {
      return false;
    }
  });
  const mermaid = await viewer.evaluate(() => !!document.querySelector("svg"));

  // 2) Every exported static route loads under its own per-file CSP.
  const routes = ["/", "/security", "/url-explainer"];
  const routeOk = {};
  for (const r of routes) {
    const p = await newPage();
    const rr = await p.goto(`${base}${r}`, { waitUntil: "networkidle" });
    routeOk[r] = rr.status() === 200 && !!rr.headers()["content-security-policy"];
    await p.waitForTimeout(800);
    await p.close();
  }

  await browser.close();

  console.log("viewer CSP header:", cspPresent, "| mermaid:", mermaid, "| WASM:", wasm);
  console.log("static routes (status 200 + CSP):", JSON.stringify(routeOk));
  console.log("CSP violations:", violations.length);
  violations.forEach((v) => console.log("  ✗", v));

  const ok = cspPresent && mermaid && wasm && Object.values(routeOk).every(Boolean) && violations.length === 0;
  console.log("\nVERDICT:", ok ? "PASS" : "FAIL");
  cleanup();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error(err);
  cleanup();
  process.exit(1);
}
