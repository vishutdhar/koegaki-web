import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { LANDING_PAGES } from "@/lib/pages";
import { COMPARISONS } from "@/lib/compare";

/**
 * lastmod for the two pages not driven by a data list: the date their content
 * last changed. Bump the date in the same change that edits the page; the
 * landing and comparison pages carry theirs in lib/pages.ts and lib/compare.ts.
 */
const HOME_LAST_MODIFIED = "2026-09-25";
const PRIVACY_LAST_MODIFIED = "2026-09-25";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE.url, lastModified: HOME_LAST_MODIFIED, changeFrequency: "weekly", priority: 1 },
    ...LANDING_PAGES.map((p) => ({
      url: `${SITE.url}${p.path}`,
      lastModified: p.lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    ...COMPARISONS.map((c) => ({
      url: `${SITE.url}/vs/${c.slug}`,
      lastModified: c.lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    {
      url: `${SITE.url}/privacy`,
      lastModified: PRIVACY_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
