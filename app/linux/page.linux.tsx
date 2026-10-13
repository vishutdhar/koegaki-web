import type { Metadata } from "next";
import { LandingPage } from "@/components/subpage/landing-page";
import { landingPage } from "@/lib/pages";
import { pageMetadata } from "@/lib/metadata";

/*
 * The Linux page, /linux, built like /mac and /windows. It exists only once a
 * Linux release does (docs/specs/2026-10-13-linux-site.md rules 8 and 11):
 * next.config.ts adds the "linux.tsx" page extension only then, so without a
 * Linux release Next does not treat this file as a page, builds nothing for
 * /linux and routes nothing new, and /linux is the site's ordinary 404 as it
 * is today.
 */
const page = landingPage("/linux")!;

export const metadata: Metadata = pageMetadata(page);

export default function Page() {
  return <LandingPage page={page} />;
}
