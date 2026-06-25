import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile elsewhere can't make Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
