import type { MetadataRoute } from "next";
import { getPostSlugs, getWorkSlugs } from "@/lib/content";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    "",
    "/about",
    "/work",
    "/blog",
    "/tools",
    "/lab",
    "/lab/ai-feature-acceptance",
  ].map((path) => ({
    url: `${site.url}${path}`,
  }));

  const workRoutes = getWorkSlugs().map((slug) => ({
    url: `${site.url}/work/${slug}`,
  }));

  const blogRoutes = getPostSlugs().map((slug) => ({
    url: `${site.url}/blog/${slug}`,
  }));

  return [...staticRoutes, ...workRoutes, ...blogRoutes];
}
