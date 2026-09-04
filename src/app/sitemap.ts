import type { MetadataRoute } from "next";
import { getPostSlugs, getWorkSlugs } from "@/lib/content";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/about", "/work", "/blog"].map((path) => ({
    url: `${site.url}${path}`,
    lastModified: new Date(),
  }));

  const workRoutes = getWorkSlugs().map((slug) => ({
    url: `${site.url}/work/${slug}`,
    lastModified: new Date(),
  }));

  const blogRoutes = getPostSlugs().map((slug) => ({
    url: `${site.url}/blog/${slug}`,
    lastModified: new Date(),
  }));

  return [...staticRoutes, ...workRoutes, ...blogRoutes];
}
