import { Nav } from "@/components/nav";
import { Hero } from "@/components/hero";
import { Footer } from "@/components/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        {/* sections (pillars, how-it-works, features, pricing, faq) land next.
            The VoiceLine motif returns as an intentional divider between them. */}
      </main>
      <Footer />
    </>
  );
}
