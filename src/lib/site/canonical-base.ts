import { normalizeBasePath } from "@/lib/site/base-path";

const DEFAULT_SITE_ORIGIN = "https://agent-render.com";

/**
 * Returns the origin (scheme + host + port) for the deployed site, without a trailing slash.
 */
export function getCanonicalSiteOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    return new URL(explicit).origin;
  }

  return DEFAULT_SITE_ORIGIN;
}

const basePath = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

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
