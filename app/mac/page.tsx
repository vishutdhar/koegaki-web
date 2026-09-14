import type { Metadata } from "next";
import { LandingPage } from "@/components/subpage/landing-page";
import { landingPage } from "@/lib/pages";
import { SITE } from "@/lib/site";

const page = landingPage("/mac")!;

export const metadata: Metadata = {
  title: { absolute: page.title },
  description: page.description,
  alternates: { canonical: page.path },
  openGraph: {
    title: page.title,
    description: page.description,
    url: page.path,
    siteName: SITE.name,
    type: "website",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image", title: page.title, description: page.description, images: ["/og.png"] },
};

export default function Page() {
  return <LandingPage page={page} />;
}
