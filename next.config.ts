import type { NextConfig } from "next";
import { LINUX_RELEASE_ENV, linuxRelease, linuxReleaseEnv, releasesDir } from "./scripts/linux-release.mjs";
import { archiveRedirects } from "./scripts/windows-archive.mjs";

const linux = linuxRelease(releasesDir(process.env, import.meta.dirname));

const nextConfig: NextConfig = {
  /**
   * The Linux release the site offers, read from the release records once,
   * here, at build time: the newest record that holds a deb, or none
   * (scripts/linux-release.mjs). Next writes the value into every bundle as a
   * literal, so lib/site.ts knows it without reading a file when a page or the
   * /buy route runs, and every Linux surface appears only once the record of a
   * Linux release is committed (docs/specs/2026-10-13-linux-site.md rules 6 to
   * 8). Without one the value is empty and the build is byte for byte the site
   * before Linux.
   */
  env: { [LINUX_RELEASE_ENV]: linuxReleaseEnv(linux) },
  /**
   * The Linux page is app/linux/page.linux.tsx, a page only once this list
   * holds "linux.tsx", which it does only with a Linux release (Next's dotted
   * page extensions). Without one the default extensions stand and Next builds
   * and routes nothing for /linux, so it stays the ordinary 404.
   */
  ...(linux ? { pageExtensions: ["tsx", "ts", "jsx", "js", "linux.tsx"] } : {}),
  // Pin the workspace root so a stray lockfile elsewhere can't make Next infer the wrong one.
  turbopack: { root: import.meta.dirname },
  /**
   * koegaki.com/downloads/<name>, for each of the 12 Windows installers
   * through 1.9.0, answers a permanent redirect (301) to the asset of the same
   * name in the windows-archive release of vishutdhar/koegaki-releases, which
   * holds the same bytes. scripts/windows-archive.mjs lists the 12 and their
   * digests, and with RELEASE_FETCH=1 the site tests ask each old url, follow
   * it, and hold the bytes to that list. The winget manifests for 1.2.1,
   * 1.4.0, 1.5.0 and 1.5.1 and a third party collection name those urls, and
   * each manifest's SHA-256 is over the bytes, so they must keep resolving to
   * exactly those bytes; docs/downloads-archive.md has the evidence that
   * winget, the Windows updater of those versions and browsers follow the
   * redirect, and why it is a 301 rather than a 308.
   *
   * Each name is its own redirect, so a name that is not archived matches
   * none and is the ordinary 404, and nothing is under public/downloads: the
   * check vercel.json runs before every build (scripts/check-release-downloads.mjs)
   * fails if anything is put there again. From 1.9.1 every installer is a
   * GitHub release asset of its own release (see lib/site.ts).
   *
   * History. Until October 2026 the 12 were static files in public/downloads,
   * and every production deployment stored all of them (166 MB), which twice
   * took the team's Vercel deployment storage to its alarm. They were static
   * because the first winget submission (microsoft/winget-pkgs PR #415017,
   * version 1.2.1) pointed at the Vercel Blob host and was labelled
   * Validation-Domain, the shared Blob domain not being attributable to the
   * publisher, and pointing it at koegaki.com cleared the label. Two ways of
   * serving the Blob under koegaki.com were tried then and dropped. A proxying
   * rewrite poisoned the edge cache on Range requests: a cold cache key first
   * hit with a Range cached the 206 fragment as the whole object, so later
   * full GETs served a truncated installer. A redirect was dropped on the
   * belief that winget's Validation-Indirect-URL check would refuse it; that
   * label was never applied to a Koegaki submission, winget's own manifests
   * for 1.10.0 onwards install from github.com, whose release urls redirect to
   * GitHub's asset host, and the urls here stay on koegaki.com, already in
   * merged manifests. A redirect needs no proxying, so the Range problem does
   * not arise: GitHub's asset host serves the bytes and the ranges.
   */
  async redirects() {
    return archiveRedirects();
  },
};

export default nextConfig;
