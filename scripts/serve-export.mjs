import { createServer } from "node:http";
import { existsSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDirectory = path.resolve("out");
const port = Number(process.env.PORT || 3000);
const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const basePath = configuredBasePath === "/" ? "" : configuredBasePath.replace(/\/$/, "");

if (!existsSync(outputDirectory)) {
  console.error("Missing `out/`. Run `npm run build` before `npm run preview`.");
  process.exit(1);
}

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
]);

const MCP_SERVER_CARD_RELATIVE = "/.well-known/mcp/server-card.json";

/**
 * Resolve the URL path to a path relative to the site root (after optional base path).
 */
function resolveSiteRelativePath(urlPath) {
  const cleanPath = urlPath.split("?", 1)[0].split("#", 1)[0];
  let relativePath = cleanPath;

  if (basePath) {
    if (relativePath === "/") {
      relativePath = `${basePath}/`;
    }

    if (relativePath === basePath) {
      relativePath = `${basePath}/`;
    }

    if (!relativePath.startsWith(basePath)) {
      return null;
    }

    relativePath = relativePath.slice(basePath.length) || "/";
  }

  return relativePath;
}

function toFilePath(urlPath) {
  const relativePath = resolveSiteRelativePath(urlPath);
  const normalizedPath = relativePath === "/" ? "/index.html" : relativePath;
  const tentativePath = path.join(outputDirectory, normalizedPath);
  return normalizedPath.endsWith("/") ? path.join(tentativePath, "index.html") : tentativePath;
}

function isMcpServerCardPath(urlPath) {
  const relativePath = resolveSiteRelativePath(urlPath);
  const normalized = relativePath.replace(/\/+$/, "") || "/";
  return normalized === MCP_SERVER_CARD_RELATIVE;
}

function mcpServerCardHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=3600",
  };
}

const server = createServer(async (request, response) => {
  const requestPath = request.url || "/";
  const method = request.method?.toUpperCase() ?? "GET";

  if (method === "OPTIONS" && isMcpServerCardPath(requestPath)) {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  const filePath = toFilePath(requestPath);

  if (!filePath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  let finalPath = filePath;

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
  const extraHeaders = isMcpServerCardPath(requestPath) ? mcpServerCardHeaders() : {};
  response.writeHead(200, { "Content-Type": contentType, ...extraHeaders });
  createReadStream(finalPath).pipe(response);
});

server.listen(port, () => {
  const suffix = basePath ? `${basePath}/` : "/";
  console.log(`Previewing static export at http://127.0.0.1:${port}${suffix}`);
});
