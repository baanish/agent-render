import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import {
  createArtifact,
  getArtifact,
  updateArtifact,
  deleteArtifact,
  cleanupExpired,
  getDb,
  closeDb,
} from "./db.js";
import { validatePayload } from "./validate.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const outputDirectory = path.resolve(process.env.OUT_DIR || "out");
const outputDirectoryWithSeparator = `${outputDirectory}${path.sep}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const API_CATALOG_CONTENT_TYPE = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';
const API_CATALOG_LINK_HEADER = '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"';

const contentTypes = new Map<string, string>([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".wasm", "application/wasm"],
  [".br", "application/octet-stream"],
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
]);

let indexHtmlCache: string | null = null;

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    return API_CATALOG_CONTENT_TYPE;
  }

  // Strip a trailing .br so any precompressed asset reports its decompressed type (matches
  // scripts/serve-export.mjs); future *.js.br / *.wasm.br stay correct instead of octet-stream.
  const typePath = filePath.endsWith(".br") ? filePath.slice(0, -3) : filePath;

  return contentTypes.get(path.extname(typePath)) || "application/octet-stream";
}

function isNextStaticAsset(filePath: string): boolean {
  return filePath.includes(`${path.sep}_next${path.sep}static${path.sep}`);
}

function headersFor(filePath: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": contentTypeFor(filePath) };

  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    headers.Link = API_CATALOG_LINK_HEADER;
  }

  if (filePath.endsWith(".br")) {
    headers["Content-Encoding"] = "br";
    headers.Vary = "Accept-Encoding";
  }

  if (isNextStaticAsset(filePath)) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  return headers;
}

/**
 * Read the built index.html from the static output directory.
 * Cached after first read for performance.
 */
function getIndexHtml(): string {
  if (indexHtmlCache) return indexHtmlCache;
  const indexPath = path.join(outputDirectory, "index.html");
  indexHtmlCache = readFileSync(indexPath, "utf-8");
  return indexHtmlCache;
}

let scriptHashesCache: string[] | null = null;

/**
 * Derive `'sha256-...'` source expressions for every inline (non-`src`) `<script>` in the built
 * index.html. These let a strict CSP `script-src` allow exactly Next's own static bootstrap/hydration
 * scripts and nothing else. They are computed from the same file the server serves, so they never
 * drift from the build (a rebuild changes the hashes; a restart picks them up). The injected payload
 * script is covered by a per-response nonce instead, since its content varies per artifact.
 *
 * Failure/fallback: if index.html cannot be read, returns `[]` (no caching) so error pages — which
 * carry no scripts — still render; the viewer is non-functional without index.html regardless.
 */
function getInlineScriptHashes(): string[] {
  if (scriptHashesCache) return scriptHashesCache;

  let html: string;
  try {
    html = getIndexHtml();
  } catch {
    return [];
  }

  const hashes: string[] = [];
  const inlineScript = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = inlineScript.exec(html)) !== null) {
    hashes.push(`'sha256-${createHash("sha256").update(match[1], "utf8").digest("base64")}'`);
  }

  scriptHashesCache = hashes;
  return hashes;
}

/**
 * Build the Content-Security-Policy for HTML responses.
 *
 * `script-src` is the load-bearing directive: it allows same-origin scripts, the build's own inline
 * scripts (by hash), and — when `nonce` is supplied — the per-response injected payload bootstrap
 * (by nonce). So even if a renderer dependency regressed into an injection sink, attacker-controlled
 * inline script in a stored payload could not execute. `'wasm-unsafe-eval'` is required because the
 * arx-family codecs decompress Brotli via a WebAssembly module (brotli-wasm), which a strict
 * `script-src` would otherwise block; it permits WebAssembly compilation but NOT JavaScript `eval`,
 * so it is far narrower than `'unsafe-eval'`. `style-src` keeps `'unsafe-inline'` because the static
 * export and mermaid emit inline styles a strict style policy would break; locking down scripts is
 * where the value is. See docs/deployment.md.
 */
function contentSecurityPolicy(nonce?: string): string {
  const scriptSrc = [
    "'self'",
    "'wasm-unsafe-eval'",
    ...(nonce ? [`'nonce-${nonce}'`] : []),
    ...getInlineScriptHashes(),
  ];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    `script-src ${scriptSrc.join(" ")}`,
  ].join("; ");
}

/**
 * Inject a payload string into the index.html so the viewer shell picks it up
 * via `window.__AGENT_RENDER_PAYLOAD__` on load. The `nonce` ties the injected script to the
 * response's CSP so it is allowed to execute under a strict `script-src`.
 */
function injectPayload(html: string, payload: string, nonce: string): string {
  // Escape </script> sequences to prevent XSS via crafted payloads breaking
  // out of the script tag. JSON.stringify alone does not escape </
  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const script = `<script nonce="${nonce}">window.__AGENT_RENDER_PAYLOAD__=${safeJson};</script>`;
  return html.replace("</head>", `${script}</head>`);
}

/**
 * Read the full request body as a UTF-8 string. Rejects bodies over 1 MB.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const limit = 1_048_576;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("Request body too large."));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Send a JSON response with the given status code. */
function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/** Send an HTML response with the given status code and a strict CSP (nonce for injected scripts). */
function htmlResponse(res: ServerResponse, status: number, body: string, nonce?: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Content-Security-Policy": contentSecurityPolicy(nonce),
  });
  res.end(body);
}

/** Serve a static file from the output directory. */
async function serveStatic(res: ServerResponse, urlPath: string, method: string): Promise<void> {
  const normalizedPath = urlPath === "/" ? "/index.html" : urlPath;

  let filePath = path.resolve(path.join(outputDirectory, normalizedPath));

  // Prevent path traversal outside the output directory
  if (!filePath.startsWith(outputDirectoryWithSeparator) && filePath !== outputDirectory) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const details = await stat(filePath);
    if (details.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    if (!path.extname(filePath)) {
      filePath = path.join(filePath, "index.html");
    }
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  const headers = headersFor(filePath);
  // The app shell (index.html) is the only static file with executable inline scripts, so it carries
  // the same strict CSP as the injected viewer. No nonce here: static index.html injects no script.
  if (filePath.endsWith(`${path.sep}index.html`)) {
    headers["Content-Security-Policy"] = contentSecurityPolicy();
  }

  res.writeHead(200, headers);
  if (method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

/** Extract a route segment matching `/api/artifacts/:id`. */
function parseArtifactId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/artifacts\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

/** Check if a path segment looks like a UUID v4. */
function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Generate a simple error HTML page for expired or missing artifacts.
 */
function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — agent-render</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  .box { text-align: center; max-width: 420px; padding: 2rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.75rem; }
  p { color: #a3a3a3; line-height: 1.6; margin: 0; }
</style>
</head>
<body><div class="box"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}

/**
 * Main request handler for the self-hosted agent-render server.
 *
 * Routes:
 * - `POST /api/artifacts` — create a new artifact
 * - `GET /api/artifacts/:id` — retrieve an artifact (refreshes TTL)
 * - `PUT /api/artifacts/:id` — update an artifact payload
 * - `DELETE /api/artifacts/:id` — delete an artifact
 * - `POST /api/cleanup` — remove expired artifacts
 * - `GET /:uuid` — render the viewer with the stored payload
 * - `GET /*` — serve static files from the build output
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Conservative security headers on every response. `nosniff` stops MIME-type confusion;
  // `no-referrer` keeps the artifact UUID (in the path) out of the Referer sent to any third-party
  // resource a rendered artifact loads; `SAMEORIGIN` blocks cross-origin framing of the viewer.
  // HTML responses additionally carry a strict Content-Security-Policy (see contentSecurityPolicy):
  // `script-src` is locked to 'self' + the build's own inline-script hashes + a per-response nonce for
  // the injected payload, so a renderer-dependency regression cannot execute attacker-controlled
  // inline script from a stored payload. `style-src` keeps 'unsafe-inline' (the export and mermaid
  // need it). See docs/deployment.md.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method?.toUpperCase() ?? "GET";

  // GET /health — liveness + database-readiness probe. Pings the DB so an unreachable database
  // reports unhealthy. No TTL side effects, so monitors can poll it without keeping artifacts alive.
  if (pathname === "/health" && method === "GET") {
    try {
      getDb().prepare("SELECT 1").get();
      jsonResponse(res, 200, { status: "ok" });
    } catch {
      jsonResponse(res, 503, { status: "error" });
    }
    return;
  }

  // CORS headers for API routes
  if (pathname.startsWith("/api/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
  }

  // POST /api/artifacts — create
  if (pathname === "/api/artifacts" && method === "POST") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      jsonResponse(res, 400, { error: "Invalid request body." });
      return;
    }
    // Tolerate any JSON value (including `null` or a primitive) without throwing; a non-object body
    // simply has no payload and is rejected as a 400 below.
    const payload = (parsed as { payload?: unknown } | null)?.payload;
    const validation = validatePayload(payload);
    if (!validation.ok) {
      jsonResponse(res, 400, { error: validation.message });
      return;
    }
    try {
      // validatePayload has confirmed payload is a string.
      const result = createArtifact(payload as string);
      jsonResponse(res, 201, result);
    } catch {
      // The request was well-formed; persistence failed (e.g. disk full). Report a server error
      // instead of masking it as a 400 client error.
      jsonResponse(res, 500, { error: "Failed to store artifact." });
    }
    return;
  }

  // POST /api/cleanup — remove expired
  if (pathname === "/api/cleanup" && method === "POST") {
    const count = cleanupExpired();
    jsonResponse(res, 200, { deleted: count });
    return;
  }

  // /api/artifacts/:id routes
  const artifactId = parseArtifactId(pathname);
  if (artifactId && pathname.startsWith("/api/artifacts/")) {
    if (method === "GET") {
      const row = getArtifact(artifactId);
      if (!row) {
        jsonResponse(res, 404, { error: "Artifact not found or expired." });
        return;
      }
      jsonResponse(res, 200, row);
      return;
    }

    if (method === "PUT") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { error: "Invalid request body." });
        return;
      }
      // Tolerate any JSON value (including `null` or a primitive) without throwing; a non-object body
      // simply has no payload and is rejected as a 400 below.
      const payload = (parsed as { payload?: unknown } | null)?.payload;
      const validation = validatePayload(payload);
      if (!validation.ok) {
        jsonResponse(res, 400, { error: validation.message });
        return;
      }
      try {
        // validatePayload has confirmed payload is a string.
        const row = updateArtifact(artifactId, payload as string);
        if (!row) {
          jsonResponse(res, 404, { error: "Artifact not found or expired." });
          return;
        }
        jsonResponse(res, 200, row);
      } catch {
        // The request was well-formed; persistence failed. Report a server error, not a 400.
        jsonResponse(res, 500, { error: "Failed to store artifact." });
      }
      return;
    }

    if (method === "DELETE") {
      const deleted = deleteArtifact(artifactId);
      if (!deleted) {
        jsonResponse(res, 404, { error: "Artifact not found." });
        return;
      }
      jsonResponse(res, 200, { deleted: true });
      return;
    }

    jsonResponse(res, 405, { error: "Method not allowed." });
    return;
  }

  // GET /:uuid — render viewer with stored payload
  const pathSegment = pathname.slice(1);
  if (method === "GET" && isUuid(pathSegment)) {
    const row = getArtifact(pathSegment);
    if (!row) {
      htmlResponse(res, 404, errorPage("Artifact not found", "This artifact has expired or does not exist."));
      return;
    }

    try {
      const nonce = randomBytes(16).toString("base64");
      const html = injectPayload(getIndexHtml(), row.payload, nonce);
      htmlResponse(res, 200, html, nonce);
    } catch {
      htmlResponse(res, 500, errorPage("Server error", "Failed to render the artifact viewer."));
    }
    return;
  }

  // Static file fallback
  await serveStatic(res, pathname, method);
}

// Initialize the database on startup and clear rows that expired while the server was down.
getDb();
cleanupExpired();

// Sweep expired artifacts hourly. Lazy deletion on read only reclaims rows that are read again, so a
// created-but-never-viewed artifact would otherwise outlive its TTL forever and grow the database
// without bound. `unref()` keeps the timer from holding the process open on its own.
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  try {
    cleanupExpired();
  } catch (error) {
    // A transient DB error (disk full, a WAL I/O error, or a write lock held by another process)
    // must not take down an otherwise-healthy serving process the way an uncaught throw from a timer
    // callback would. Log and retry on the next interval — the request paths report their own 5xx.
    console.error("agent-render: scheduled cleanup sweep failed; retrying next interval.", error);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

const server = createServer((req, res) => {
  handleRequest(req, res).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500);
      res.end("Internal server error");
    }
  });
});

server.listen(port, host, () => {
  console.log(`agent-render self-hosted server running at http://${host}:${port}`);
});

// Graceful shutdown: stop the sweep timer, stop accepting connections, then close the database so
// SQLite checkpoints its WAL before exit. Docker and systemd send SIGTERM on stop; Ctrl-C sends
// SIGINT. If connections do not drain within the grace window, the shutdown is treated as FAILED
// (not a clean stop): stragglers are destroyed and the process exits non-zero so abandoned in-flight
// work is visible to the supervisor instead of masked as a clean exit. Configurable for tests.
const SHUTDOWN_GRACE_MS = Number(process.env.SHUTDOWN_GRACE_MS || 5000);
let shuttingDown = false;
let exited = false;
function finish(code: number): void {
  if (exited) return;
  exited = true;
  closeDb();
  process.exit(code);
}
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down agent-render self-hosted server.`);
  clearInterval(cleanupTimer);
  // Resolves only once every connection has drained — a clean graceful stop.
  server.close(() => finish(0));
  // Close idle keep-alive sockets so an otherwise-quiet server drains immediately.
  server.closeIdleConnections?.();
  setTimeout(() => {
    if (exited) return;
    console.error(
      `Forced shutdown after ${SHUTDOWN_GRACE_MS}ms: connections did not drain; in-flight requests were dropped.`,
    );
    // Decide the non-zero exit before destroying sockets, so closeAllConnections() firing the
    // server.close() callback cannot win the race and report a clean exit(0).
    exited = true;
    server.closeAllConnections?.();
    closeDb();
    process.exit(1);
  }, SHUTDOWN_GRACE_MS).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

export { handleRequest, injectPayload };
