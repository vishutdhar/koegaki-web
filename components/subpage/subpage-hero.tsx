import { SITE } from "@/lib/site";
import { CtaButton } from "@/components/cta-button";
import { DownloadCta, PlatformNote } from "@/components/download-cta";

/**
 * The top of every secondary page. Left-aligned and quieter than the home hero:
 * no demo video, no load-in choreography, one headline that states the page's
 * subject in the visitor's own words, then the same two calls to action the
 * home page uses so the path to a download never changes shape.
 */
export function SubpageHero({
  kicker,
  title,
  lede,
  cta = `Start ${SITE.trialDays}-day free trial`,
}: {
  /** The section of the site this page belongs to, e.g. "Koegaki for Mac". */
  kicker: string;
  title: string;
  lede: string;
  cta?: string;
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-8 pt-20 sm:pt-28">
      <div className="max-w-3xl">
        <p className="font-mono text-xs text-ember">{kicker}</p>
        <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.03em] sm:text-6xl sm:tracking-[-0.04em]">
          {title}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted text-pretty">{lede}</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <DownloadCta>{cta}</DownloadCta>
          <CtaButton href={SITE.checkoutUrl} variant="secondary" external>
            Buy <span className="text-ink">${SITE.priceUSD}</span>
            <span className="text-faint"> · one-time</span>
          </CtaButton>
        </div>
        <PlatformNote className="mt-5" macRequirements={SITE.macRequirementsStrict} />
      </div>
    </section>
  );
}
