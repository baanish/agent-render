import type { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/site/canonical-base";

/** Required for `output: "export"` — emit sitemap.xml at build time. */
export const dynamic = "force-static";

/**
 * Static sitemap for the exported shell; lists the canonical home URL for crawlers.
 * Regenerated on each `next build` / publish so `lastmod` stays current.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: getCanonicalSiteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
