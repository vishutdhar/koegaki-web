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
   * NEXT_PUBLIC_DOWNLOAD_URL went missing. The Windows fallback uses the
   * publisher-domain /downloads path, a real static file under
   * public/downloads (see next.config.ts for why it is neither a proxy nor
   * a redirect), because package managers require installer URLs on a domain
   * attributable to the publisher that serve the bytes directly. The blob
   * host is already public in appcast.xml, so committing either exposes
   * nothing.
   */
  downloadUrl:
    process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
    "https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/Koegaki-1.3.0.dmg",

  requirements: "macOS 14+ · Apple Silicon recommended",

  windowsDownloadUrl:
    process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL ??
    "https://koegaki.com/downloads/Koegaki-1.3.0-setup.exe",

  windowsRequirements: "Windows 10 & 11 · 64-bit",

  /** Public support address (the app's published support email). */
  contactEmail: "support@freedom-terminal.com",

  /**
   * Speech model, stated plainly (no unsourced benchmark claims in product copy).
   * Both platforms run the same model; only the compute differs, and each string
   * is verified against what that build actually does rather than assumed.
   */
  engine: "Parakeet TDT 0.6B v3 · on-device (Apple Neural Engine)",
  windowsEngine: "Parakeet TDT 0.6B v3 · on-device (CPU)",
} as const;

export type Site = typeof SITE;
