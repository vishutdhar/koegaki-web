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
  tagline: "The fastest private dictation for Mac and Windows.",
  description:
    "Koegaki turns your voice into text anywhere on your Mac or PC, instantly and fully on-device. Your voice never leaves your machine.",

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
    "https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/Koegaki-1.9.0.dmg",

  requirements: "macOS 14+ · Apple Silicon recommended",
  /** What the shipped Mac build actually needs (the export is arm64 only); the secondary pages state this. */
  macRequirementsStrict: "macOS 14+ · Apple Silicon (M1 or later)",

  windowsDownloadUrl:
    process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL ??
    "https://koegaki.com/downloads/Koegaki-1.9.0-setup.exe",

  windowsRequirements: "Windows 10 & 11 · 64-bit",

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
} as const;

export type Site = typeof SITE;
