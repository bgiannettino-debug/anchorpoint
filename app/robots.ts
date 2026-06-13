import type { MetadataRoute } from "next";

// Let crawlers index the public catalog (areas, climbs) for SEO, but keep
// them off the API and the per-user / auth pages, which have no indexable
// content and just burn serverless invocations when crawled.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/account", "/ticks", "/bookmarks", "/login"],
    },
  };
}
