import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

const PLACEHOLDER = "__ISSUER_BASE__";

const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const basePathSegment =
  configuredBasePath === "" || configuredBasePath === "/"
    ? ""
    : configuredBasePath.replace(/\/$/, "");

const issuerPathSegment = basePathSegment.replace(/^\//, "");

const siteOrigin = (process.env.SITE_ORIGIN || process.env.PUBLIC_ORIGIN || "https://agent-render.com")
  .trim()
  .replace(/\/+$/, "");

const issuer = `${siteOrigin}${basePathSegment}`;

const outDir = path.resolve("out");

async function main() {
  const templateOAuth = await readFile(
    path.join("scripts", "oauth-discovery-templates", "oauth-authorization-server"),
    "utf8",
  );
  const templateOidc = await readFile(
    path.join("scripts", "oauth-discovery-templates", "openid-configuration"),
    "utf8",
  );

  const bodyOAuth = templateOAuth.split(PLACEHOLDER).join(issuer);
  const bodyOidc = templateOidc.split(PLACEHOLDER).join(issuer);

  if (!issuerPathSegment) {
    const wellRoot = path.join(outDir, ".well-known");
    await mkdir(wellRoot, { recursive: true });
    await writeFile(path.join(wellRoot, "oauth-authorization-server"), bodyOAuth, "utf8");
    await writeFile(path.join(wellRoot, "openid-configuration"), bodyOidc, "utf8");
    await copyFile(
      path.join("scripts", "oauth-discovery-templates", "jwks.json"),
      path.join(wellRoot, "jwks.json"),
    );
  } else {
    const wellRoot = path.join(outDir, ".well-known");
    await mkdir(wellRoot, { recursive: true });
    const oauthDir = path.join(wellRoot, "oauth-authorization-server");
    const oidcDir = path.join(wellRoot, "openid-configuration");
    await mkdir(oauthDir, { recursive: true });
    await mkdir(oidcDir, { recursive: true });
    await writeFile(path.join(oauthDir, issuerPathSegment), bodyOAuth, "utf8");
    await writeFile(path.join(oidcDir, issuerPathSegment), bodyOidc, "utf8");

    const underBase = path.join(outDir, issuerPathSegment, ".well-known");
    await mkdir(underBase, { recursive: true });
    await copyFile(
      path.join("scripts", "oauth-discovery-templates", "jwks.json"),
      path.join(underBase, "jwks.json"),
    );
  }

  console.log(`OAuth/OIDC discovery metadata issuer set to: ${issuer}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
