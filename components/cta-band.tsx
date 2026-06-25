import { SITE } from "@/lib/site";
import { Reveal } from "./reveal";
import { CtaButton } from "./cta-button";

export function CtaBand() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl border border-hairline bg-surface/40 px-8 py-16 text-center sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-64 w-[80%] -translate-x-1/2 rounded-full bg-ember-soft blur-3xl"
          />
          <p className="font-display text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
            Stop typing what you could say.
          </p>
          <p className="mx-auto mt-4 max-w-md text-muted">
            Try Koegaki free for {SITE.trialDays} days. Private, instant, on your Mac.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CtaButton href={SITE.downloadUrl} external>
              Start {SITE.trialDays}-day free trial
            </CtaButton>
            <CtaButton href={SITE.checkoutUrl} variant="secondary" external>
              Buy <span className="text-ink">${SITE.priceUSD}</span>
            </CtaButton>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
