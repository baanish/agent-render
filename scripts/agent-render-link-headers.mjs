/**
 * Build the RFC 8288 `Link` header value for agent discovery (homepage HTML responses).
 * Paths honor `NEXT_PUBLIC_BASE_PATH` so subpath deployments advertise correct URLs.
 *
 * @param {string} [configuredBasePath]
 * @returns {string}
 */
export function buildAgentRenderLinkHeaderValue(configuredBasePath = "") {
  const trimmed = (configuredBasePath || "").trim();
  const baseSegment = trimmed === "/" ? "" : trimmed.replace(/^\/+|\/+$/g, "");

  /** @param {string} relativePath path segments without a leading slash (e.g. `.well-known/x`) */
  const absolutePath = (relativePath) => {
    const suffix = relativePath.startsWith("/") ? relativePath.slice(1) : relativePath;
    if (!baseSegment) {
      return `/${suffix}`;
    }
    return `/${baseSegment}/${suffix}`.replace(/\/+/g, "/");
  };

  const links = [
    `<${absolutePath(".well-known/api-catalog.json")}>; rel="api-catalog"; type="application/json"`,
    `<${absolutePath("docs/openapi.json")}>; rel="service-desc"; type="application/openapi+json"`,
    `<${absolutePath("README.md")}>; rel="service-doc"; type="text/markdown"`,
    `<${absolutePath("docs/payload-format.md")}>; rel="describedby"; type="text/markdown"`,
  ];

  return links.join(", ");
}
