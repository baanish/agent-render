/**
 * Normalizes configured deployment base paths into the shape Next.js and static asset URLs expect.
 *
 * @param raw - Raw base path string, usually `NEXT_PUBLIC_BASE_PATH`.
 * @returns Empty string for root deployments, otherwise a leading-slash path without a trailing slash.
 */
export function normalizeBasePath(raw: string | undefined): string {
  const configured = raw?.trim() ?? "";
  if (configured === "" || configured === "/") {
    return "";
  }

  const withLeadingSlash = configured.startsWith("/") ? configured : `/${configured}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

/**
 * Reads the configured app base path from the public Next.js environment.
 */
export function getConfiguredBasePath(): string {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}

/**
 * Prefixes a root-relative path with the configured app base path.
 *
 * @param path - Root-relative URL path, with or without a leading slash.
 * @returns A URL path suitable for client-rendered links and static asset references.
 */
export function withBasePath(path: string): string {
  const basePath = getConfiguredBasePath();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!basePath) {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return `${basePath}/`;
  }

  return `${basePath}${normalizedPath}`;
}
