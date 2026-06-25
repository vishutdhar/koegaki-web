import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Pillars } from "@/components/pillars";
import { HowItWorks } from "@/components/how-it-works";
import { Features } from "@/components/features";
import { Pricing } from "@/components/pricing";
import { Faq } from "@/components/faq";
import { CtaBand } from "@/components/cta-band";
import { VoiceLine } from "@/components/voice-line";
import { Footer } from "@/components/footer";

function Divider() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6">
      <VoiceLine className="opacity-50" />
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Pillars />
        <Divider />
        <HowItWorks />
        <Features />
        <Divider />
        <Pricing />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
