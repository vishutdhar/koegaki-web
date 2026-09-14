import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { LANDING_PAGES } from "@/lib/pages";
import { COMPARISONS } from "@/lib/compare";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, changeFrequency: "weekly", priority: 1 },
    ...LANDING_PAGES.map((p) => ({
      url: `${SITE.url}${p.path}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...COMPARISONS.map((c) => ({
      url: `${SITE.url}/vs/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${SITE.url}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
