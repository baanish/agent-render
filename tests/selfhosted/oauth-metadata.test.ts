// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildJwksDocument,
  buildOAuthAuthorizationServerMetadata,
  buildOpenIdConfiguration,
  resolveIssuerBaseFromRequest,
} from "../../selfhosted/oauth-metadata.js";

describe("oauth-metadata", () => {
  it("builds RFC 8414 document with required fields", () => {
    const doc = buildOAuthAuthorizationServerMetadata("https://example.com/app");
    expect(doc.issuer).toBe("https://example.com/app");
    expect(doc.authorization_endpoint).toBe("https://example.com/app/oauth/authorize");
    expect(doc.token_endpoint).toBe("https://example.com/app/oauth/token");
    expect(doc.jwks_uri).toBe("https://example.com/app/.well-known/jwks.json");
    expect(doc.grant_types_supported).toContain("authorization_code");
    expect(Array.isArray(doc.grant_types_supported)).toBe(true);
  });

  it("includes response_types_supported for OIDC document", () => {
    const doc = buildOpenIdConfiguration("https://example.com");
    expect(doc.response_types_supported).toEqual(["code"]);
    expect(doc.jwks_uri).toBe("https://example.com/.well-known/jwks.json");
  });

  it("returns a valid empty JWKS", () => {
    expect(buildJwksDocument()).toEqual({ keys: [] });
  });

  describe("resolveIssuerBaseFromRequest", () => {
    const original = process.env.PUBLIC_ORIGIN;

    beforeEach(() => {
      delete process.env.PUBLIC_ORIGIN;
    });

    afterEach(() => {
      if (original === undefined) {
        delete process.env.PUBLIC_ORIGIN;
      } else {
        process.env.PUBLIC_ORIGIN = original;
      }
    });

    it("prefers PUBLIC_ORIGIN when set", () => {
      process.env.PUBLIC_ORIGIN = "https://id.example.org/custom";
      expect(resolveIssuerBaseFromRequest({}, false)).toBe("https://id.example.org/custom");
    });

    it("uses X-Forwarded-* when PUBLIC_ORIGIN is unset", () => {
      const headers = {
        "x-forwarded-host": "api.example.com",
        "x-forwarded-proto": "https",
      };
      expect(resolveIssuerBaseFromRequest(headers, false)).toBe("https://api.example.com");
    });

    it("defaults to localhost without headers", () => {
      expect(resolveIssuerBaseFromRequest({}, false)).toBe("http://localhost");
    });
  });
});
