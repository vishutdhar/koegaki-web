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
  tagline: "The fastest private dictation for Mac.",
  description:
    "Koegaki turns your voice into text anywhere on your Mac, instantly and fully on-device. Your voice never leaves your machine.",

  priceUSD: 30,
  trialDays: 30,

  /** Lemon Squeezy hosted checkout link (public). Set NEXT_PUBLIC_CHECKOUT_URL in Vercel. */
  checkoutUrl:
    process.env.NEXT_PUBLIC_CHECKOUT_URL ?? "https://koegaki.lemonsqueezy.com/buy/PLACEHOLDER",
  /** Direct download of the notarized .dmg (public). Set NEXT_PUBLIC_DOWNLOAD_URL in Vercel. */
  downloadUrl:
    process.env.NEXT_PUBLIC_DOWNLOAD_URL ??
    "https://github.com/vishutdhar/Koegaki/releases/latest/download/Koegaki.dmg",

  requirements: "macOS 14+ · Apple Silicon recommended",

  /** Public support address (the app's published support email). */
  contactEmail: "vishutdhar1993@gmail.com",

  /** Speech model, stated plainly (no unsourced benchmark claims in product copy). */
  engine: "Parakeet TDT 0.6B v3 · on-device (Apple Neural Engine)",
} as const;

export type Site = typeof SITE;
