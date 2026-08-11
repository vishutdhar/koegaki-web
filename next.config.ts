import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile elsewhere can't make Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
  /**
   * Serve installer downloads from the publisher domain. The files live on
   * Vercel Blob, but package managers (winget's Validation-Domain check) and
   * cautious users need the URL to be a domain attributable to the publisher,
   * so /downloads/<file> redirects to the blob. A REDIRECT, deliberately not
   * a proxying rewrite: proxying through the edge cache was proven to poison
   * on Range requests (a cold cache key first hit with a Range cached the 206
   * fragment as the whole object, so later full GETs served a truncated
   * installer), and installers are exactly what download managers fetch with
   * ranges. A redirect caches only the small redirect response; the blob host
   * itself handles ranges correctly. Package manager tooling follows
   * redirects and hashes the final bytes, the same shape as GitHub release
   * URLs. Versioned filenames stay immutable: each release adds a new blob
   * and a new path, and a manifest's recorded hash keeps matching what its
   * URL serves.
   */
  async redirects() {
    return [
      {
        source: "/downloads/:file",
        destination:
          "https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/:file",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
