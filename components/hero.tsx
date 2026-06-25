import { SITE } from "@/lib/site";
import { CtaButton } from "./cta-button";
import { DemoFrame } from "./demo-frame";

export function Hero() {
  return (
    <section id="top" className="relative mx-auto w-full max-w-5xl px-6 pb-16 pt-20 sm:pt-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1 font-mono text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-ember" />
          On-device · {SITE.requirements}
        </p>
        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          Dictate anywhere
          <br />
          on your Mac.
          <br />
          <span className="text-ember">Instantly. Privately.</span>
        </h1>
        <p className="mx-auto mt-7 max-w-xl text-lg leading-relaxed text-muted">
          Press a key, speak, and your words appear wherever you&apos;re typing. The speech
          model runs entirely on your Mac — your voice never leaves it.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <CtaButton href={SITE.downloadUrl} external>
            Start {SITE.trialDays}-day free trial
          </CtaButton>
          <CtaButton href={SITE.checkoutUrl} variant="secondary" external>
            Buy — ${SITE.priceUSD}
          </CtaButton>
        </div>
      </div>

      <div className="mt-20">
        <DemoFrame />
      </div>
    </section>
  );
}
