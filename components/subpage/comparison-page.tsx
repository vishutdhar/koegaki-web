import { Nav } from "@/components/nav";
import { SITE } from "@/lib/site";
import { Footer } from "@/components/footer";
import { Faq } from "@/components/faq";
import { CtaBand } from "@/components/cta-band";
import { PageStructuredData } from "@/components/structured-data";
import { SubpageHero } from "./subpage-hero";
import { Prose } from "./prose";
import { CompareTable } from "./compare-table";
import type { Comparison } from "@/lib/compare";

export function ComparisonPage({ c }: { c: Comparison }) {
  return (
    <>
      <PageStructuredData path={`/vs/${c.slug}`} title={c.h1} faqs={c.faqs} />
      <Nav home={false} />
      <main className="flex-1">
        <SubpageHero kicker="Compare" title={c.h1} lede={c.lede} />
        <CompareTable other={c.other} rows={c.rows} asOf={c.asOf} />
        <Prose sections={c.sections} />
        <Faq items={c.faqs} />
        <CtaBand macRequirements={SITE.macRequirementsStrict} />
      </main>
      <Footer extended />
    </>
  );
}
