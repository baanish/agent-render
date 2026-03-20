const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return trimmed.replace(/\/$/, "");
}

/**
 * Returns the final path segment when the URL targets a UUID v4 artifact route, for example
 * `/550e8400-e29b-41d4-a716-446655440000/`.
 *
 * When this app is built with a Next.js `basePath`, `usePathname()` already strips that prefix,
 * so callers should pass that pathname here and omit `basePath` unless the string still includes it.
 */
export function getArtifactIdFromPathname(pathname: string, basePath = ""): string | null {
  const normalizedBase = normalizeBasePath(basePath);
  let tail = pathname;

  if (normalizedBase) {
    if (!tail.startsWith(normalizedBase)) {
      return null;
    }

    tail = tail.slice(normalizedBase.length) || "/";
  }

  const trimmed = tail.replace(/\/+$/, "");
  const segment = trimmed.split("/").filter(Boolean).pop() ?? "";

  return UUID_V4.test(segment) ? segment : null;
}
