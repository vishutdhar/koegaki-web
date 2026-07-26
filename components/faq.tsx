import { SITE } from "@/lib/site";
import { Section } from "./section";
import { Reveal } from "./reveal";

export const FAQS = [
  {
    q: "Is my voice really private?",
    a: "Yes. The speech model runs entirely on your own machine. No audio and no transcript is ever sent anywhere. There is no account and no server.",
  },
  {
    q: "What do I need to run it?",
    a: `Mac: ${SITE.requirements}, where the model uses the Neural Engine. Windows: ${SITE.windowsRequirements}. One licence covers both.`,
  },
  {
    q: "Does it need the internet?",
    a: "Barely. The speech model downloads once on first launch, and dictation then works fully offline. Activating a license and a quiet daily license check use the network, but being offline never locks you out, and no audio or text is ever involved.",
  },
  {
    q: "How does the free trial work?",
    a: `You get every feature free for ${SITE.trialDays} days. After that, a one-time $${SITE.priceUSD} license keeps it running. No subscription.`,
  },
  {
    q: "Do I get updates?",
    a: "Yes. Every update is included with your license, for life. Buy once and the app keeps getting better.",
  },
  {
    q: "Is there a Windows version?",
    a: "Yes. Koegaki runs on Mac and Windows, and one license covers both. The Windows build does the same thing the same way: your voice is transcribed on your own machine and never sent anywhere.",
  },
  {
    q: "Windows says it protected my PC. Is that a problem?",
    a: "No, and you should expect it. The Windows installer is not yet signed with a certificate, so Windows warns the first time you run it. Usually you choose More info, then Run anyway. On a PC with Smart App Control switched on there is no Run anyway, and the installer is refused outright; that setting can only be turned off by resetting it in Windows Security, so if you would rather not, write to us and wait for the signed build. The warning is about the missing certificate, not about anything found in the app. Signing is on the list.",
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
