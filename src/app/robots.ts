import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/site/canonical-base";

/** Required for `output: "export"` — emit robots.txt at build time. */
export const dynamic = "force-static";

/**
 * Serves `/robots.txt` and points crawlers at the absolute `/sitemap.xml` URL for this deployment.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: getCanonicalSiteUrl("/sitemap.xml"),
  };
}
