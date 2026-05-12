import { createServer } from "node:http";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDirectory = path.resolve("out");
const port = Number(process.env.PORT || 3000);
const apiCatalogContentType = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';
const apiCatalogLinkHeader = '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"';

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
  [".wasm", "application/wasm"],
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
]);

function normalizeBasePath(value) {
  const configuredBasePath = (value || "").trim();
  if (configuredBasePath === "" || configuredBasePath === "/") {
    return "";
  }

  const withLeadingSlash = configuredBasePath.startsWith("/") ? configuredBasePath : `/${configuredBasePath}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function readManifestBasePath() {
  try {
    const manifest = JSON.parse(readFileSync(path.resolve(".next", "routes-manifest.json"), "utf8"));
    return normalizeBasePath(typeof manifest.basePath === "string" ? manifest.basePath : "");
  } catch {
    return "";
  }
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH) || readManifestBasePath();

function contentTypeFor(filePath) {
  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    return apiCatalogContentType;
  }

  if (filePath.endsWith(".json.br")) {
    return "application/json; charset=utf-8";
  }

  if (filePath.endsWith(".css.br")) {
    return "text/css; charset=utf-8";
  }

  return contentTypes.get(path.extname(filePath)) || "application/octet-stream";
}

function isNextStaticAsset(filePath) {
  return filePath.includes(`${path.sep}_next${path.sep}static${path.sep}`);
}

function headersFor(filePath) {
  const headers = { "Content-Type": contentTypeFor(filePath) };

  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    headers.Link = apiCatalogLinkHeader;
  }

  if (filePath.endsWith(".json.br") || filePath.endsWith(".css.br")) {
    headers["Content-Encoding"] = "br";
    headers.Vary = "Accept-Encoding";
  }

  if (isNextStaticAsset(filePath)) {
    headers["Cache-Control"] = "public, max-age=31536000, immutable";
  }

  return headers;
}

function isInsideOutputDirectory(filePath) {
  const relativePath = path.relative(outputDirectory, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function toFilePath(urlPath) {
  const queryIndex = urlPath.indexOf("?");
  const hashIndex = urlPath.indexOf("#");
  let pathEnd = urlPath.length;
  if (queryIndex !== -1) pathEnd = Math.min(pathEnd, queryIndex);
  if (hashIndex !== -1) pathEnd = Math.min(pathEnd, hashIndex);
  const cleanPath = urlPath.slice(0, pathEnd);
  let relativePath = cleanPath;

  if (basePath) {
    if (relativePath === "/") {
      relativePath = `${basePath}/`;
    }

    if (relativePath === basePath) {
      relativePath = `${basePath}/`;
    }

    if (!relativePath.startsWith(`${basePath}/`)) {
      return null;
    }

    relativePath = relativePath.slice(basePath.length) || "/";
  }

  const normalizedPath = relativePath === "/" ? "/index.html" : relativePath;
  const tentativePath = path.resolve(outputDirectory, normalizedPath.replace(/^\/+/, ""));

  if (!isInsideOutputDirectory(tentativePath)) {
    return null;
  }

  return normalizedPath.endsWith("/") ? path.join(tentativePath, "index.html") : tentativePath;
}

const server = createServer(async (request, response) => {
  const requestPath = request.url || "/";
  const method = (request.method || "GET").toUpperCase();

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

  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  response.writeHead(200, headersFor(finalPath));
  if (method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(finalPath).pipe(response);
});

server.listen(port, () => {
  const suffix = basePath ? `${basePath}/` : "/";
  console.log(`Previewing static export at http://127.0.0.1:${port}${suffix}`);
});
