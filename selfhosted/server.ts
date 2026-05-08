import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import {
  createArtifact,
  getArtifact,
  updateArtifact,
  deleteArtifact,
  cleanupExpired,
  getDb,
} from "./db.js";
import { validatePayload } from "./validate.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const outputDirectory = path.resolve(process.env.OUT_DIR || "out");

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
  [".br", "application/octet-stream"],
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
]);

let indexHtmlCache: string | null = null;

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    return API_CATALOG_CONTENT_TYPE;
  }

  return contentTypes.get(path.extname(filePath)) || "application/octet-stream";
}

function headersFor(filePath: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": contentTypeFor(filePath) };

  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    headers.Link = API_CATALOG_LINK_HEADER;
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

/**
 * Inject a payload string into the index.html so the viewer shell picks it up
 * via `window.__AGENT_RENDER_PAYLOAD__` on load.
 */
function injectPayload(html: string, payload: string): string {
  // Escape </script> sequences to prevent XSS via crafted payloads breaking
  // out of the script tag. JSON.stringify alone does not escape </
  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const script = `<script>window.__AGENT_RENDER_PAYLOAD__=${safeJson};</script>`;
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

/** Send an HTML response with the given status code. */
function htmlResponse(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

/** Serve a static file from the output directory. */
async function serveStatic(res: ServerResponse, urlPath: string, method: string): Promise<void> {
  const cleanPath = urlPath.split("?", 1)[0].split("#", 1)[0];
  const normalizedPath = cleanPath === "/" ? "/index.html" : cleanPath;

  let filePath = path.resolve(path.join(outputDirectory, normalizedPath));
  const resolvedOutputDir = path.resolve(outputDirectory);

  // Prevent path traversal outside the output directory
  if (!filePath.startsWith(resolvedOutputDir + path.sep) && filePath !== resolvedOutputDir) {
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

  res.writeHead(200, headersFor(filePath));
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
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method?.toUpperCase() ?? "GET";

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
    try {
      const body = JSON.parse(await readBody(req));
      const validation = validatePayload(body.payload);
      if (!validation.ok) {
        jsonResponse(res, 400, { error: validation.message });
        return;
      }
      const result = createArtifact(body.payload);
      jsonResponse(res, 201, result);
    } catch {
      jsonResponse(res, 400, { error: "Invalid request body." });
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
      try {
        const body = JSON.parse(await readBody(req));
        const validation = validatePayload(body.payload);
        if (!validation.ok) {
          jsonResponse(res, 400, { error: validation.message });
          return;
        }
        const row = updateArtifact(artifactId, body.payload);
        if (!row) {
          jsonResponse(res, 404, { error: "Artifact not found or expired." });
          return;
        }
        jsonResponse(res, 200, row);
      } catch {
        jsonResponse(res, 400, { error: "Invalid request body." });
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
      const html = injectPayload(getIndexHtml(), row.payload);
      htmlResponse(res, 200, html);
    } catch {
      htmlResponse(res, 500, errorPage("Server error", "Failed to render the artifact viewer."));
    }
    return;
  }

  // Static file fallback
  await serveStatic(res, pathname, method);
}

// Initialize database on startup
getDb();

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

export { handleRequest, injectPayload };
