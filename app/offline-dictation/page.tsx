import type { Metadata } from "next";
import { LandingPage } from "@/components/subpage/landing-page";
import { landingPage } from "@/lib/pages";
import { pageMetadata } from "@/lib/metadata";

const page = landingPage("/offline-dictation")!;

export const metadata: Metadata = pageMetadata(page);

export default function Page() {
  return <LandingPage page={page} />;
}
