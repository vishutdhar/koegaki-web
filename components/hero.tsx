import { SITE } from "@/lib/site";
import { CtaButton } from "./cta-button";
import { DemoVideo } from "./demo-video";

export function Hero() {
  return (
    <section id="top" className="relative mx-auto w-full max-w-5xl px-6 pb-16 pt-20 sm:pt-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="animate-rise mb-6 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-muted backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-ember shadow-[0_0_8px_rgba(232,100,60,0.9)]" />
          On-device <span className="text-faint">·</span> Apple Silicon
        </p>
        <h1
          className="animate-rise font-display text-5xl font-semibold leading-[0.98] tracking-[-0.03em] sm:text-[5.25rem] sm:tracking-[-0.045em]"
          style={{ animationDelay: "80ms" }}
        >
          Dictate anywhere on your Mac.
          <br className="hidden sm:block" />{" "}
          <span className="inline-block bg-gradient-to-br from-ember to-[#ff8a63] bg-clip-text pb-[0.08em] text-transparent">
            Instantly. Privately.
          </span>
        </h1>
        <p
          className="animate-rise mx-auto mt-6 max-w-lg text-lg leading-relaxed text-muted text-pretty"
          style={{ animationDelay: "160ms" }}
        >
          Press a key, speak, and your words appear wherever you&apos;re typing. The speech
          model runs entirely on your Mac. Your voice never leaves it.
        </p>
        <div
          className="animate-rise mt-10 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "240ms" }}
        >
          <CtaButton href={SITE.downloadUrl} external>
            Start {SITE.trialDays}-day free trial
          </CtaButton>
          <CtaButton href={SITE.checkoutUrl} variant="secondary" external>
            Buy <span className="text-ink">${SITE.priceUSD}</span>
            <span className="text-faint"> · one-time</span>
          </CtaButton>
        </div>
      </div>

      <div className="animate-rise-lg mt-24" style={{ animationDelay: "420ms" }}>
        <DemoVideo />
      </div>
    </section>
  );
}
