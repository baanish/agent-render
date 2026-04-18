import { createServer } from "node:http";
import { existsSync, createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const outputDirectory = path.resolve("out");
const port = Number(process.env.PORT || 3000);
const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const basePath = configuredBasePath === "/" ? "" : configuredBasePath.replace(/\/$/, "");

if (!existsSync(outputDirectory)) {
  console.error("Missing `out/`. Run `npm run build` before `npm run preview`.");
  process.exit(1);
}

const helperPath = path.join(process.cwd(), "selfhosted", "dist", "markdown-for-agents.js");

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

async function loadMarkdownHelpers() {
  if (!existsSync(helperPath)) {
    console.warn(
      "Missing selfhosted/dist/markdown-for-agents.js. Run `npm run build` (includes postbuild) for Accept: text/markdown support.",
    );
    return null;
  }
  return import(pathToFileURL(helperPath).href);
}

async function main() {
  const markdownHelpers = await loadMarkdownHelpers();

  const server = createServer(async (request, response) => {
    const requestPath = request.url || "/";
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

    const accept = request.headers.accept;
    const ext = path.extname(finalPath);
    const isHtml =
      ext === ".html" &&
      request.method === "GET" &&
      markdownHelpers &&
      markdownHelpers.responseWantsMarkdown(accept);

    if (isHtml) {
      const details = await stat(finalPath);
      if (details.size > markdownHelpers.MARKDOWN_MAX_HTML_BYTES) {
        const contentType = contentTypes.get(ext) || "application/octet-stream";
        response.writeHead(200, { "Content-Type": contentType });
        createReadStream(finalPath).pipe(response);
        return;
      }

      const html = readFileSync(finalPath, "utf-8");
      const md = markdownHelpers.htmlToMarkdown(html);
      const tokens = markdownHelpers.estimateMarkdownTokens(md);
      const headers = markdownHelpers.markdownResponseHeaders(tokens);
      const body = Buffer.from(md, "utf-8");
      response.writeHead(200, {
        ...headers,
        "Content-Length": body.length,
      });
      response.end(body);
      return;
    }

    const contentType = contentTypes.get(ext) || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    createReadStream(finalPath).pipe(response);
  });

  server.listen(port, () => {
    const suffix = basePath ? `${basePath}/` : "/";
    console.log(`Previewing static export at http://127.0.0.1:${port}${suffix}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
