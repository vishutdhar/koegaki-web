import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Faq } from "@/components/faq";
import { CtaBand } from "@/components/cta-band";
import { PageStructuredData } from "@/components/structured-data";
import { VoiceLine } from "@/components/voice-line";
import { SubpageHero } from "./subpage-hero";
import { Prose } from "./prose";
import type { LandingPage as LandingPageData } from "@/lib/pages";

export function LandingPage({ page }: { page: LandingPageData }) {
  return (
    <>
      <PageStructuredData path={page.path} title={page.name} faqs={page.faqs} />
      <Nav home={false} />
      <main className="flex-1">
        <SubpageHero kicker={page.kicker} title={page.h1} lede={page.lede} />
        <div className="mx-auto w-full max-w-5xl px-6">
          <VoiceLine className="opacity-50" />
        </div>
        <Prose sections={page.sections} />
        <Faq items={page.faqs} />
        <CtaBand />
      </main>
      <Footer extended />
    </>
  );
}
