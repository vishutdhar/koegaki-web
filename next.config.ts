import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile elsewhere can't make Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
  /**
   * Installer downloads live at public/downloads/ as REAL STATIC FILES, and
   * no config entry exists for them on purpose. Two schemes were tried and
   * proven wrong before this one: a proxying rewrite to Vercel Blob poisoned
   * the edge cache on Range requests (a cold cache key first hit with a Range
   * cached the 206 fragment as the whole object, so later full GETs served a
   * truncated installer, and download managers fetch installers with ranges),
   * and a redirect to the blob trips winget's Validation-Indirect-URL check,
   * which requires the manifest URL to serve the installer directly. Static
   * files get correct Range handling from the platform, no cache rewriting,
   * and a URL on the publisher domain that serves the bytes first hand.
   * Versioned filenames stay immutable: each release adds a new file, and a
   * manifest's recorded hash keeps matching what its URL serves.
   */
};

export default nextConfig;
