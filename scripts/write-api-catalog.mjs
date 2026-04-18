import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Emit `public/.well-known/api-catalog` (RFC 9727 + RFC 9264 linkset) before `next build`.
 * Paths are absolute on the deployment host (`/...` or `/{basePath}/...`) so discovery works
 * without embedding a deployment origin.
 */
async function main() {
  const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
  const basePath =
    configuredBasePath === "" || configuredBasePath === "/"
      ? ""
      : configuredBasePath.replace(/\/$/, "");

  const p = (suffix) => (basePath ? `${basePath}${suffix}` : suffix);

  /** @type {{ linkset: unknown[] }} */
  const catalog = {
    linkset: [
      {
        anchor: p("/api/artifacts"),
        "service-desc": [
          {
            href: p("/openapi/selfhosted-artifacts.yaml"),
            type: "application/yaml",
          },
        ],
        "service-doc": [
          {
            href: p("/selfhosted-api/"),
            type: "text/html",
          },
        ],
        status: [
          {
            href: p("/health.json"),
            type: "application/json",
          },
        ],
      },
    ],
  };

  const outDir = path.resolve("public", ".well-known");
  await mkdir(outDir, { recursive: true });
  const target = path.join(outDir, "api-catalog");
  const body = `${JSON.stringify(catalog, null, 2)}\n`;
  await writeFile(target, body, "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
