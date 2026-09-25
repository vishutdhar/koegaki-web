import type { Metadata } from "next";
import { SITE } from "./site";

/**
 * The Open Graph fields every page shares. Next replaces a nested metadata
 * object (openGraph, twitter) wholesale rather than merging it with the
 * layout's, so a page that sets its own openGraph silently drops anything it
 * does not restate. Every page spreads this instead of listing the fields by
 * hand, so none of them can lose one.
 */
export const OPEN_GRAPH_DEFAULTS = {
  siteName: SITE.name,
  locale: "en_US",
  type: "website" as const,
  images: ["/og.png"],
};

/**
 * Metadata for a page other than the home page: its own title, description,
 * canonical URL, and matching Open Graph and Twitter cards. `path` is the
 * site path ("/mac"); canonical and og:url both resolve against metadataBase,
 * so they are always the same absolute URL.
 */
export function pageMetadata({
  path,
  title,
  description,
}: {
  path: string;
  title: string;
  description: string;
}): Metadata {
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, title, description, url: path },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}
