import type { Metadata } from "next";
import { LandingPage } from "@/components/subpage/landing-page";
import { landingPage } from "@/lib/pages";

const page = landingPage("/offline-dictation")!;

export const metadata: Metadata = {
  title: { absolute: page.title },
  description: page.description,
  alternates: { canonical: page.path },
  openGraph: { title: page.title, description: page.description, url: page.path },
};

export default function Page() {
  return <LandingPage page={page} />;
}
