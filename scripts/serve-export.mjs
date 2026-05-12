import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

  const typePath = filePath.endsWith(".br") ? filePath.slice(0, -3) : filePath;

  return contentTypes.get(path.extname(typePath)) || "application/octet-stream";
}

function isNextStaticAsset(filePath) {
  return filePath.includes(`${path.sep}_next${path.sep}static${path.sep}`);
}

function headersFor(filePath, contentLength) {
  const headers = {
    "Content-Length": String(contentLength),
    "Content-Type": contentTypeFor(filePath),
  };

  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    headers.Link = apiCatalogLinkHeader;
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

function isInsideOutputDirectory(filePath) {
  const relativePath = path.relative(outputDirectory, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function addStaticRoute(files, routePath, file) {
  if (!files.has(routePath)) {
    files.set(routePath, file);
  }
}

function addStaticRouteAliases(files, routePath, file) {
  addStaticRoute(files, routePath, file);

  if (routePath === "/index.html") {
    addStaticRoute(files, "/", file);
    return;
  }

  if (routePath.endsWith("/index.html")) {
    const directoryRoute = routePath.slice(0, -"index.html".length);
    addStaticRoute(files, directoryRoute, file);
    addStaticRoute(files, directoryRoute.slice(0, -1), file);
  }
}

function collectStaticFiles(directory, files = new Map()) {
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (!isInsideOutputDirectory(entryPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      collectStaticFiles(entryPath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const routePath = `/${path.relative(outputDirectory, entryPath).split(path.sep).join("/")}`;
    addStaticRouteAliases(files, routePath, {
      filePath: entryPath,
      size: statSync(entryPath).size,
    });
  }

  return files;
}

const staticFiles = collectStaticFiles(outputDirectory);

function toRoutePath(urlPath) {
  const queryIndex = urlPath.indexOf("?");
  const hashIndex = urlPath.indexOf("#");
  let pathEnd = urlPath.length;
  if (queryIndex !== -1) pathEnd = Math.min(pathEnd, queryIndex);
  if (hashIndex !== -1) pathEnd = Math.min(pathEnd, hashIndex);
  const cleanPath = urlPath.slice(0, pathEnd);
  let routePath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;

  if (basePath) {
    if (routePath === "/") {
      routePath = `${basePath}/`;
    }

    if (routePath === basePath) {
      routePath = `${basePath}/`;
    }

    if (!routePath.startsWith(`${basePath}/`)) {
      return null;
    }

    routePath = routePath.slice(basePath.length) || "/";
  }

  return routePath || "/";
}

const server = createServer(async (request, response) => {
  const requestPath = request.url || "/";
  const method = (request.method || "GET").toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  const routePath = toRoutePath(requestPath);
  const staticFile = routePath ? staticFiles.get(routePath) : null;

  if (!staticFile) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, headersFor(staticFile.filePath, staticFile.size));
  if (method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(staticFile.filePath).pipe(response);
});

server.listen(port, () => {
  const suffix = basePath ? `${basePath}/` : "/";
  console.log(`Previewing static export at http://127.0.0.1:${port}${suffix}`);
});
