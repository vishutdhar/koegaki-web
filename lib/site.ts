/**
 * The Linux release the site offers, or null until the first one ships: the
 * newest record in releases/ that holds a deb. next.config.ts reads the
 * records at build time (scripts/linux-release.mjs) and Next writes its answer
 * here as a literal, so no page and no route reads a file when it runs. Every
 * Linux surface of the site keys off this one value
 * (docs/specs/2026-10-13-linux-site.md): with no Linux release, nothing Linux
 * renders and every page is what it was before Linux.
 */
export type LinuxRelease = { version: string; url: string; size: number; sha256: string };
const linuxReleaseText = process.env.KOEGAKI_LINUX_RELEASE;
export const LINUX_RELEASE: LinuxRelease | null = linuxReleaseText ? (JSON.parse(linuxReleaseText) as LinuxRelease) : null;

/** `withLinux` once a Linux release exists, `today` until then: copy that names Linux only when Linux ships. */
export function ifLinux<T>(withLinux: T, today: T): T {
  return LINUX_RELEASE ? withLinux : today;
}

/**
 * The day the Linux copy goes live (YYYY-MM-DD). With a Linux release every
 * page's sitemap lastmod is at least this date, since every page's footer and
 * most pages' copy change that day. The release that first records a deb sets
 * it to its own date (spec section 5).
 */
export const LINUX_COPY_DATE = "2026-10-16";

/** A page's sitemap lastmod: `date`, raised to LINUX_COPY_DATE once Linux ships. */
export function lastModified(date: string): string {
  return ifLinux(date > LINUX_COPY_DATE ? date : LINUX_COPY_DATE, date);
}

/**
 * Central site config — the single source of truth for price, trial, URLs, and core copy.
 * Commerce URLs come from PUBLIC env vars (set in Vercel), never committed. This repo is
 * PUBLIC, so NO secrets belong here — only a public checkout link and a public download URL.
 */
export const SITE = {
  name: "Koegaki",
  /** Brand mark: the kanji for "voice". */
  mark: "声",
  domain: "koegaki.com",
  url: "https://koegaki.com",
  // The home title is "Koegaki · <tagline>", which must stay within 63 characters.
  tagline: ifLinux("The fastest private dictation. Mac, Windows, Linux.", "The fastest private dictation for Mac and Windows."),
  description: ifLinux(
    "Koegaki turns your voice into text anywhere on Mac, Windows or Linux, instantly and fully on-device. Your voice never leaves your machine.",
    "Koegaki turns your voice into text anywhere on your Mac or PC, instantly and fully on-device. Your voice never leaves your machine.",
  ),

  priceUSD: 30,
  trialDays: 30,

  /** Lemon Squeezy hosted checkout link (public). Set NEXT_PUBLIC_CHECKOUT_URL in Vercel. */
  checkoutUrl:
    process.env.NEXT_PUBLIC_CHECKOUT_URL ?? "https://koegaki.lemonsqueezy.com/buy/PLACEHOLDER",
  /**
   * Direct downloads (public). Both fall back to a real serving URL rather
   * than to a placeholder, so an unset env var degrades to a working build
   * instead of a dead link. The previous macOS fallback pointed at releases
   * on a PRIVATE repo, which would have 404'd for every visitor the moment
   * NEXT_PUBLIC_DOWNLOAD_URL went missing.
   *
   * Where a release lives. Through 1.9.0 the Mac disk image, and the copy of
   * the Windows installer the in-app updater fetches, are on Vercel Blob, and
   * this link serves the same Windows installer as a static file in
   * public/downloads on koegaki.com, where winget's manifests point too (see
   * next.config.ts for why). From 1.9.1 both files are assets of a public
   * GitHub release,
   * https://github.com/vishutdhar/koegaki-releases/releases/download/v<version>/<file>,
   * recorded with their sizes and digests in releases/<version>.json, and
   * these links move there with that release; the site tests hold a GitHub
   * link to exactly that asset of a recorded release. Every host here is
   * already public in appcast.xml and windows-updates.json, so committing
   * them exposes nothing.
   */
  downloadUrl:
    process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
    "https://github.com/vishutdhar/koegaki-releases/releases/download/v1.13.8/Koegaki-1.13.8.dmg",

  requirements: "macOS 14+ · Apple Silicon recommended",
  /** The Macs the shipped build supports; the secondary pages state this. The binary itself is universal (arm64 and x86_64, read from the 1.13.3 DMG), so this names a support line, not the architectures the export holds. */
  macRequirementsStrict: "macOS 14+ · Apple Silicon (M1 or later)",

  windowsDownloadUrl:
    process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL ??
    "https://github.com/vishutdhar/koegaki-releases/releases/download/v1.15.2/Koegaki-1.15.2-setup.exe",

  windowsRequirements: "Windows 10 & 11 · 64-bit",

  /**
   * The Linux download, the deb of LINUX_RELEASE as a GitHub release asset,
   * and what it needs, or null until a Linux release exists. The requirement
   * is the floor of the release build, made on Ubuntu 22.04 (glibc 2.35), whose
   * binary needs GLIBC 2.34 and loads on Ubuntu 22.04 and Debian 12 or newer.
   */
  linuxDownloadUrl: LINUX_RELEASE?.url ?? null,
  linuxRequirements: ifLinux("Debian 12 or Ubuntu 22.04 or newer · x86_64", null),

  /** Public support address (the app's published support email). */
  contactEmail: "support@freedom-terminal.com",

  /**
   * English speech model per platform, stated plainly (no unsourced benchmark
   * claims in product copy). Both platforms moved to Parakeet Ultra in 1.7.0;
   * only the compute differs. Each string is verified against what that build
   * actually does rather than assumed, and the site tests hold it to the
   * English identity public/models.json serves for that platform.
   */
  engine: "Parakeet Ultra · on-device (Apple Neural Engine)",
  windowsEngine: "Parakeet Ultra · on-device (CPU)",
  /** The Linux build runs the Windows build's engine, Parakeet Ultra through sherpa-onnx on the CPU, from the model index's linux block. */
  linuxEngine: ifLinux("Parakeet Ultra · on-device (CPU)", null),
} as const;

export type Site = typeof SITE;
