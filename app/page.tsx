import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { VoiceLine } from "@/components/voice-line";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <VoiceLine className="my-8" />
        {/* sections (pillars, how-it-works, features, pricing, faq) land next */}
      </main>
      <Footer />
    </>
  );
}
