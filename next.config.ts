import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so a stray lockfile elsewhere can't make Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
  /**
   * The Windows installers through 1.9.0 live at public/downloads/ as REAL
   * STATIC FILES, and no config entry exists for them on purpose. They stay
   * there, frozen at those 12 files (a site test pins the list), because the
   * winget manifests for 1.2.1, 1.4.0, 1.5.0 and 1.5.1 and a third party
   * collection point at them, and each manifest's recorded hash must keep
   * matching what its URL serves. From 1.9.1 the installers are GitHub
   * release assets instead (see lib/site.ts), and nothing new lands here.
   *
   * Why koegaki.com rather than the Blob: the first winget submission
   * (microsoft/winget-pkgs PR #415017, version 1.2.1) pointed at the Blob
   * host and was labelled Validation-Domain, since the shared Blob domain is
   * not attributable to the publisher, and pointing it at koegaki.com
   * cleared the label. Two ways of serving the Blob under koegaki.com were
   * tried here first and dropped. A proxying rewrite poisoned the edge cache
   * on Range requests: a cold cache key first hit with a Range cached the
   * 206 fragment as the whole object, so later full GETs served a truncated
   * installer, and download managers fetch installers with ranges. A
   * redirect was dropped in review on the belief that winget's
   * Validation-Indirect-URL check would refuse it; that label was never
   * applied to a Koegaki submission, and winget accepts GitHub release URLs
   * routinely although they redirect to GitHub's asset host. Static files
   * get correct Range handling from the platform, no cache rewriting, and a
   * URL on the publisher domain that serves the bytes first hand.
   *
   * Preview deployments carry none of these files, on purpose. Every
   * deployment stores its own copy of the build output, and the installers in
   * every preview filled the team's deployment storage, so vercel.json runs
   * scripts/strip-preview-installers.mjs before the build to remove them from
   * a preview built on Vercel's own build machine. Every other build keeps
   * them all and fails if the installer the site offers is missing, so a
   * /downloads 404 on a preview URL is expected and can never reach production.
   */
};

export default nextConfig;
