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
  [".yaml", "application/yaml; charset=utf-8"],
  [".yml", "application/yaml; charset=utf-8"],
]);

function contentTypeFor(filePath) {
  if (filePath.endsWith(`${path.sep}.well-known${path.sep}api-catalog`)) {
    return 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';
  }

  return contentTypes.get(path.extname(filePath)) || "application/octet-stream";
}

function toFilePath(urlPath) {
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

  const normalizedPath = relativePath === "/" ? "/index.html" : relativePath;
  const tentativePath = path.join(outputDirectory, normalizedPath);
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

  response.writeHead(200, { "Content-Type": contentTypeFor(finalPath) });
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
