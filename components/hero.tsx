import { SITE } from "@/lib/site";
import { CtaButton } from "./cta-button";
import { DemoVideo } from "./demo-video";

export function Hero() {
  return (
    <section id="top" className="relative mx-auto w-full max-w-5xl px-6 pb-16 pt-20 sm:pt-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="animate-rise mb-7 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-ember shadow-[0_0_8px_rgba(232,100,60,0.9)]" />
          On-device · {SITE.requirements}
        </p>
        <h1
          className="animate-rise font-display text-5xl font-semibold leading-[1.03] tracking-[-0.03em] text-balance sm:text-[5.25rem]"
          style={{ animationDelay: "80ms" }}
        >
          Dictate anywhere on your Mac.{" "}
          <span className="bg-gradient-to-br from-ember to-[#ff8a63] bg-clip-text text-transparent">
            Instantly. Privately.
          </span>
        </h1>
        <p
          className="animate-rise mx-auto mt-7 max-w-xl text-lg leading-relaxed text-muted text-pretty"
          style={{ animationDelay: "160ms" }}
        >
          Press a key, speak, and your words appear wherever you&apos;re typing. The speech
          model runs entirely on your Mac — your voice never leaves it.
        </p>
        <div
          className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "240ms" }}
        >
          <CtaButton href={SITE.downloadUrl} external>
            Start {SITE.trialDays}-day free trial
          </CtaButton>
          <CtaButton href={SITE.checkoutUrl} variant="secondary" external>
            Buy — ${SITE.priceUSD}
          </CtaButton>
        </div>
      </div>

      <div className="animate-rise mt-20" style={{ animationDelay: "360ms" }}>
        <DemoVideo />
      </div>
    </section>
  );
}
