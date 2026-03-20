import { createServer } from "node:http";
import { existsSync, createReadStream } from "node:fs";
import { mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { openArtifactStore } from "./artifact-db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const port = Number(process.env.PORT || 3000);
const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const basePath = configuredBasePath === "/" ? "" : configuredBasePath.replace(/\/$/, "");
const staticRoot = path.resolve(process.env.STATIC_ROOT || path.join(repoRoot, "out"));
const databasePath = process.env.DATABASE_PATH || path.join(repoRoot, "data", "artifacts.sqlite");

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!existsSync(staticRoot)) {
  console.error(`Missing static root at ${staticRoot}. Run npm run build before starting the self-hosted server.`);
  process.exit(1);
}

const dataDir = path.dirname(databasePath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const store = openArtifactStore(databasePath);

const contentTypes = new Map([
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
]);

function normalizeRequestPath(url) {
  const raw = url.split("?", 1)[0].split("#", 1)[0];
  let requestPath = raw;

  if (basePath) {
    if (requestPath === "/" || requestPath === basePath) {
      requestPath = `${basePath}/`;
    }

    if (!requestPath.startsWith(basePath)) {
      return null;
    }

    requestPath = requestPath.slice(basePath.length) || "/";
  }

  return requestPath;
}

function toStaticFilePath(requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const tentativePath = path.join(staticRoot, normalizedPath);
  return normalizedPath.endsWith("/") ? path.join(tentativePath, "index.html") : tentativePath;
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => {
      chunks.push(chunk);
      if (chunks.reduce((acc, c) => acc + c.length, 0) > 12_000_000) {
        reject(new Error("body too large"));
      }
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function matchApiPath(requestPath) {
  const prefix = "/api/artifacts";
  if (!requestPath.startsWith(prefix)) {
    return null;
  }

  const rest = requestPath.slice(prefix.length);
  if (rest === "" || rest === "/") {
    return { kind: "collection" };
  }

  const trimmed = rest.replace(/^\/+/, "");
  if (!trimmed) {
    return null;
  }

  const id = trimmed.split("/")[0];
  return { kind: "item", id };
}

function isUuidArtifactPath(requestPath) {
  const trimmed = requestPath.replace(/\/+$/, "");
  const segment = trimmed.split("/").filter(Boolean).pop() ?? "";
  return UUID_SEGMENT.test(segment);
}

const server = createServer(async (request, response) => {
  try {
    const requestPath = normalizeRequestPath(request.url || "/");

    if (!requestPath) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const api = matchApiPath(requestPath);

    if (api?.kind === "collection" && request.method === "POST") {
      const raw = await readBody(request);
      let body;
      try {
        body = JSON.parse(raw || "{}");
      } catch {
        sendJson(response, 400, { error: "invalid_json" });
        return;
      }

      const payload = body.payload;
      if (typeof payload !== "string") {
        sendJson(response, 400, { error: "invalid_payload", message: "Expected a string `payload` field." });
        return;
      }

      try {
        const created = store.createArtifact(payload);
        sendJson(response, 201, {
          id: created.id,
          createdAt: new Date(created.createdAt).toISOString(),
          expiresAt: new Date(created.expiresAt).toISOString(),
        });
      } catch (error) {
        sendJson(response, 400, { error: "invalid_payload", message: String(error.message || error) });
      }
      return;
    }

    if (api?.kind === "item" && api.id) {
      if (request.method === "GET") {
        const result = store.getArtifact(api.id);
        if (!result.ok) {
          sendJson(response, 404, { error: result.reason });
          return;
        }

        const row = result.row;
        sendJson(response, 200, {
          id: row.id,
          payload: row.payload,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
          lastViewedAt: row.last_viewed_at ? new Date(row.last_viewed_at).toISOString() : null,
          expiresAt: new Date(row.expires_at).toISOString(),
        });
        return;
      }

      if (request.method === "PUT") {
        const raw = await readBody(request);
        let body;
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          sendJson(response, 400, { error: "invalid_json" });
          return;
        }

        if (typeof body.payload !== "string") {
          sendJson(response, 400, { error: "invalid_payload", message: "Expected a string `payload` field." });
          return;
        }

        try {
          const updated = store.updateArtifact(api.id, body.payload);
          if (!updated.ok) {
            sendJson(response, 404, { error: updated.reason });
            return;
          }

          sendJson(response, 200, { id: api.id, expiresAt: new Date(updated.expiresAt).toISOString() });
        } catch (error) {
          sendJson(response, 400, { error: "invalid_payload", message: String(error.message || error) });
        }
        return;
      }

      if (request.method === "DELETE") {
        const removed = store.deleteArtifact(api.id);
        if (!removed) {
          sendJson(response, 404, { error: "not_found" });
          return;
        }

        sendJson(response, 200, { ok: true });
        return;
      }

      response.writeHead(405, { Allow: "GET, PUT, DELETE" });
      response.end("Method Not Allowed");
      return;
    }

    if (request.method === "GET" && isUuidArtifactPath(requestPath)) {
      const indexFile = path.join(staticRoot, "index.html");
      if (!existsSync(indexFile)) {
        response.writeHead(500);
        response.end("Missing index.html export");
        return;
      }

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      createReadStream(indexFile).pipe(response);
      return;
    }

    let finalPath = toStaticFilePath(requestPath);

    try {
      const details = await stat(finalPath);
      if (details.isDirectory()) {
        finalPath = path.join(finalPath, "index.html");
      }
    } catch {
      if (!path.extname(finalPath)) {
        finalPath = path.join(finalPath, "index.html");
      }
    }

    if (!existsSync(finalPath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const contentType = contentTypes.get(path.extname(finalPath)) || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(finalPath).pipe(response);
  } catch (error) {
    console.error(error);
    response.writeHead(500);
    response.end("Internal Server Error");
  }
});

server.listen(port, () => {
  const suffix = basePath ? `${basePath}/` : "/";
  console.log(`Self-hosted agent-render at http://127.0.0.1:${port}${suffix}`);
  console.log(`SQLite database: ${databasePath}`);
  console.log(`Static root: ${staticRoot}`);
});
