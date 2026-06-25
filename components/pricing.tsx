import { SITE } from "@/lib/site";
import { Section } from "./section";
import { Reveal } from "./reveal";
import { CtaButton } from "./cta-button";
import { IconCheck } from "./icons";

const INCLUDED = [
  "Every feature. No tiers, no add-ons",
  "Unlimited on-device dictation",
  "Custom vocabulary & shortcuts",
  "Free updates",
  "Use on your Macs",
];

export function Pricing() {
  return (
    <Section id="pricing" eyebrow="Pricing">
      <Reveal>
        <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
          Buy it once. Keep it.
        </h2>
        <p className="mt-3 max-w-md text-muted">
          No subscription. Try everything free for {SITE.trialDays} days, then it&apos;s a single
          payment.
        </p>
      </Reveal>

      <Reveal delay={120} className="mt-12">
        <div className="relative mx-auto max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface/50 p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-ember/40 to-transparent"
          />
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold tracking-tight">
              ${SITE.priceUSD}
            </span>
            <span className="text-muted">one-time</span>
          </div>
          <p className="mt-1.5 font-mono text-xs text-faint">
            {SITE.trialDays}-day free trial · Mac now · Windows coming
          </p>

          <ul className="mt-7 space-y-3">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm">
                <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                <span className="text-ink/90">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3">
            <CtaButton href={SITE.downloadUrl} external>
              Start {SITE.trialDays}-day free trial
            </CtaButton>
            <CtaButton href={SITE.checkoutUrl} variant="secondary" external>
              Buy now <span className="text-ink">${SITE.priceUSD}</span>
            </CtaButton>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
