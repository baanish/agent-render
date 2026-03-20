import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SelfHostedArtifactStore } from "../src/lib/selfhosted/store.ts";
import { isUuidV4 } from "../src/lib/selfhosted/stored-payload.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "out");

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

type SelfHostedServerOptions = {
  dbPath: string;
  ttlMs?: number;
  now?: () => number;
  publicOrigin?: string;
  staticDir?: string;
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(body);
}

function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function injectStoredPayload(indexHtml: string, artifact: { id: string; payload: string; expiresAt: string }): string {
  const bootstrap = JSON.stringify({ id: artifact.id, payload: artifact.payload, expiresAt: artifact.expiresAt });
  const script = `<script>window.__AGENT_RENDER_STORED_PAYLOAD__=${bootstrap};</script>`;
  return indexHtml.replace("</head>", `${script}</head>`);
}

function getPublicUrl(options: { req: IncomingMessage; id: string; publicOrigin?: string }): string {
  if (options.publicOrigin) {
    return `${options.publicOrigin.replace(/\/$/, "")}/${options.id}`;
  }

  const protocol = (options.req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = options.req.headers.host ?? "localhost";
  return `${protocol}://${host}/${options.id}`;
}

async function tryServeStatic(reqPath: string, res: ServerResponse, staticDir: string): Promise<boolean> {
  const normalized = reqPath === "/" ? "/index.html" : reqPath;
  const resolved = path.resolve(staticDir, `.${normalized}`);
  if (!resolved.startsWith(staticDir)) {
    return false;
  }

  try {
    const fileStat = await stat(resolved);
    if (fileStat.isDirectory()) {
      const nestedIndex = path.join(resolved, "index.html");
      const nestedHtml = await readFile(nestedIndex);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(nestedHtml);
      return true;
    }

    const body = await readFile(resolved);
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_TYPES[path.extname(resolved)] ?? "application/octet-stream");
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

function renderMissingArtifactPage(reason: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Artifact unavailable · agent-render</title>
    <style>
      body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1020;color:#f5f7fb;margin:0;display:grid;min-height:100vh;place-items:center;padding:24px}
      main{max-width:640px;background:#111a30;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
      h1{margin:0 0 12px;font-size:2rem}
      p{line-height:1.7;color:#d7dcef}
      code{background:rgba(255,255,255,.08);padding:.15rem .4rem;border-radius:.45rem}
      a{color:#8dd4ff}
    </style>
  </head>
  <body>
    <main>
      <h1>Artifact unavailable</h1>
      <p>${reason}</p>
      <p>Stored artifacts in self-hosted mode use a 24-hour sliding TTL. A successful read extends the expiry window; expired rows are removed on access or cleanup.</p>
      <p><a href="/">Open the fragment-based homepage</a></p>
    </main>
  </body>
</html>`;
}

export function createSelfHostedServer(options: SelfHostedServerOptions): { server: Server; store: SelfHostedArtifactStore } {
  const store = new SelfHostedArtifactStore({ dbPath: options.dbPath, ttlMs: options.ttlMs, now: options.now });
  const staticDir = options.staticDir ?? outDir;
  const resolvedIndexHtmlPath = path.join(staticDir, "index.html");

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;

    res.setHeader("Cache-Control", "no-store");

    if (method === "GET" && (await tryServeStatic(pathname, res, staticDir))) {
      return;
    }

    if (pathname === "/api/artifacts" && method === "POST") {
      try {
        const body = (await parseJsonBody(req)) as { payload?: string; id?: string };
        if (typeof body.payload !== "string") {
          json(res, 400, { error: "Request body must include a payload string." });
          return;
        }

        const record = await store.create(body.payload, body.id);
        json(res, 201, {
          id: record.id,
          payload: record.payload,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          lastViewedAt: record.lastViewedAt,
          expiresAt: record.expiresAt,
          url: getPublicUrl({ req, id: record.id, publicOrigin: options.publicOrigin }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create artifact.";
        const status = /UNIQUE constraint/i.test(message) ? 409 : 400;
        json(res, status, { error: message });
      }
      return;
    }

    const artifactMatch = pathname.match(/^\/api\/artifacts\/([0-9a-fA-F-]+)$/);
    if (artifactMatch) {
      const id = artifactMatch[1];
      if (!isUuidV4(id)) {
        json(res, 400, { error: "Artifact id must be a UUID v4." });
        return;
      }

      if (method === "GET") {
        const record = store.getById(id, { refreshTtl: true });
        if (!record) {
          json(res, 404, { error: "Artifact not found or expired." });
          return;
        }
        json(res, 200, record);
        return;
      }

      if (method === "PUT") {
        try {
          const body = (await parseJsonBody(req)) as { payload?: string };
          if (typeof body.payload !== "string") {
            json(res, 400, { error: "Request body must include a payload string." });
            return;
          }

          const record = await store.update(id, body.payload);
          if (!record) {
            json(res, 404, { error: "Artifact not found or expired." });
            return;
          }
          json(res, 200, record);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to update artifact.";
          json(res, 400, { error: message });
        }
        return;
      }

      if (method === "DELETE") {
        const deleted = store.delete(id);
        json(res, deleted ? 200 : 404, deleted ? { deleted: true } : { error: "Artifact not found." });
        return;
      }
    }

    if (method === "GET" && pathname !== "/" && isUuidV4(pathname.slice(1))) {
      const record = store.getById(pathname.slice(1), { refreshTtl: true });
      if (!record) {
        html(res, 404, renderMissingArtifactPage("The requested artifact was not found, has expired, or was already deleted."));
        return;
      }

      try {
        const indexHtml = await readFile(resolvedIndexHtmlPath, "utf8");
        html(res, 200, injectStoredPayload(indexHtml, record));
      } catch {
        html(res, 500, renderMissingArtifactPage("The static viewer export is missing. Run `npm run build` before starting self-hosted mode."));
      }
      return;
    }

    json(res, 404, { error: "Not found." });
  });

  return { server, store };
}
