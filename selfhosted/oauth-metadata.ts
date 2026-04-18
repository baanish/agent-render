/**
 * Build OAuth 2.0 Authorization Server Metadata (RFC 8414) and OpenID Provider
 * Metadata for discovery. The static viewer has no interactive OAuth login; endpoints
 * are published so agents can discover that this host does not integrate with an
 * external IdP for the artifact APIs.
 */

const AUTH_PATH = "/oauth/authorize";
const TOKEN_PATH = "/oauth/token";
const JWKS_PATH = "/.well-known/jwks.json";

/** Normalize optional URL origin (scheme + host[:port], no trailing slash). */
function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("Issuer origin must not be empty.");
  }
  return trimmed;
}

/**
 * Return RFC 8414 authorization server metadata for this host.
 *
 * @param issuerBase - Full issuer URL including optional path prefix (no trailing slash)
 */
export function buildOAuthAuthorizationServerMetadata(issuerBase: string): Record<string, unknown> {
  const issuer = issuerBase.replace(/\/+$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}${AUTH_PATH}`,
    token_endpoint: `${issuer}${TOKEN_PATH}`,
    jwks_uri: `${issuer}${JWKS_PATH}`,
    grant_types_supported: ["authorization_code", "client_credentials", "refresh_token"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
  };
}

/**
 * Return OpenID Connect discovery document (issuer-level metadata).
 *
 * @param issuerBase - Full issuer URL including optional path prefix (no trailing slash)
 */
export function buildOpenIdConfiguration(issuerBase: string): Record<string, unknown> {
  const oauth = buildOAuthAuthorizationServerMetadata(issuerBase);
  return {
    ...oauth,
    response_types_supported: ["code"],
  };
}

/**
 * Return a minimal JWKS document (no active keys). Valid JSON for discovery wiring.
 */
export function buildJwksDocument(): { keys: unknown[] } {
  return { keys: [] };
}

/**
 * Resolve issuer base URL from optional env and request headers.
 * Uses `PUBLIC_ORIGIN` when set (e.g. `https://example.com`); otherwise derives
 * from `X-Forwarded-Host` / `Host` and `X-Forwarded-Proto` for reverse proxies.
 */
export function resolveIssuerBaseFromRequest(
  headers: NodeJS.Dict<string | string[] | undefined>,
  isTls: boolean,
): string {
  const fromEnv = process.env.PUBLIC_ORIGIN?.trim();
  if (fromEnv) {
    return normalizeOrigin(fromEnv);
  }
  const first = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) return value[0];
    return value;
  };
  const host = first(headers["x-forwarded-host"]) ?? first(headers.host);
  if (!host?.trim()) {
    return "http://localhost";
  }
  const forwardedProto = first(headers["x-forwarded-proto"])?.toLowerCase();
  const scheme =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : isTls
        ? "https"
        : "http";
  return normalizeOrigin(`${scheme}://${host.trim()}`);
}
