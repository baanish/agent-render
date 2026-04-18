/**
 * Shared helpers for resolving the deployed absolute site URL used in metadata, sitemap, and robots.
 * Prefer `NEXT_PUBLIC_SITE_URL` (or `SITE_URL` at build time) so static exports embed the real domain;
 * falls back to `VERCEL_URL` on Vercel and `http://localhost:3000` for local builds.
 */

function normalizeConfiguredBasePath(raw: string | undefined): string {
  const configured = raw?.trim() ?? "";
  if (configured === "" || configured === "/") {
    return "";
  }
  return configured.replace(/\/$/, "");
}

/**
 * Returns the origin (scheme + host + port) for the deployed site, without a trailing slash.
 */
export function getCanonicalSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) {
    return new URL(explicit).origin;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}

const basePath = normalizeConfiguredBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

/**
 * Builds an absolute URL for a path under the configured `NEXT_PUBLIC_BASE_PATH`.
 * The path must start with `/` (e.g. `/`, `/sitemap.xml`).
 */
export function getCanonicalSiteUrl(path: string): string {
  const prefix = path.startsWith("/") ? path : `/${path}`;
  const origin = getCanonicalSiteOrigin();
  if (!basePath) {
    return `${origin}${prefix}`;
  }
  if (prefix === "/") {
    return `${origin}${basePath}/`;
  }
  return `${origin}${basePath}${prefix}`;
}

/**
 * Value for Next.js `metadataBase` so relative metadata URLs resolve against the real deploy location.
 */
export function getMetadataBase(): URL {
  return new URL(getCanonicalSiteUrl("/"));
}
