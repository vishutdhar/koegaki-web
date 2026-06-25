import { SITE } from "@/lib/site";
import { Section } from "./section";
import { Reveal } from "./reveal";

const FAQS = [
  {
    q: "Is my voice really private?",
    a: "Yes. The speech model runs entirely on your Mac. No audio and no transcript is ever sent anywhere. There is no account and no server.",
  },
  {
    q: "What do I need to run it?",
    a: `${SITE.requirements}. It runs best on Apple Silicon, where the model uses the Neural Engine.`,
  },
  {
    q: "Does it need the internet?",
    a: "Only once. The speech model downloads on first launch, then Koegaki works fully offline forever after.",
  },
  {
    q: "How does the free trial work?",
    a: `You get every feature free for ${SITE.trialDays} days. After that, a one-time $${SITE.priceUSD} license keeps it running. No subscription.`,
  },
  {
    q: "Do I get updates?",
    a: "Yes, updates are included with your license.",
  },
  {
    q: "Is there a Windows version?",
    a: "A Windows app is in the works. Your license is built to carry across platforms.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ">
      <Reveal>
        <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
          Questions, answered.
        </h2>
      </Reveal>
      <Reveal delay={100} className="mt-12">
        <div className="mx-auto max-w-2xl">
          {FAQS.map(({ q, a }) => (
            <details key={q} className="group border-b border-hairline py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-medium tracking-tight">
                {q}
                <span className="shrink-0 text-xl leading-none text-ember transition-transform duration-200 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
