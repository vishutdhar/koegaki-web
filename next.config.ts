import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile elsewhere can't make Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
  /**
   * Serve installer downloads from the publisher domain. The files live on
   * Vercel Blob, but package managers (winget's Validation-Domain check) and
   * cautious users need the URL to be a domain attributable to the publisher,
   * so /downloads/<file> proxies the blob byte for byte. Versioned filenames
   * stay immutable: each release adds a new blob and a new path, and a
   * manifest's recorded hash keeps matching what its URL serves.
   */
  async rewrites() {
    return [
      {
        source: "/downloads/:file",
        destination:
          "https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/:file",
      },
    ];
  },
};

export default nextConfig;
