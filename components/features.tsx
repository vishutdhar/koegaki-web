import { SITE } from "@/lib/site";
import { Section } from "./section";
import { Reveal } from "./reveal";
import { IconChip, IconApps, IconKey, IconBook, IconMenuBar } from "./icons";

const SMALL = [
  {
    icon: IconApps,
    title: "Works in every app",
    body: "Mail, Slack, your editor, the browser. If you can type there, you can dictate there.",
  },
  {
    icon: IconKey,
    title: "Your shortcut",
    body: "Globe, a modifier combo, or any key. Push-to-talk or toggle.",
  },
  {
    icon: IconBook,
    title: "Word replacements",
    body: "Say a short word, Koegaki types the full phrase. Names, emails, jargon.",
  },
  {
    icon: IconMenuBar,
    title: "Lives in the menu bar",
    body: "Always a keystroke away, never in your way. No Dock clutter.",
  },
];

export function Features() {
  return (
    <Section id="features" eyebrow="Features">
      <Reveal>
        <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
          Everything you need. Nothing you don&apos;t.
        </h2>
      </Reveal>

      <div className="mt-14 grid gap-4 md:grid-cols-2">
        {/* featured card — the differentiator */}
        <Reveal className="md:col-span-2">
          <div className="relative overflow-hidden rounded-xl border border-hairline bg-surface/40 p-7 sm:p-9">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-ember-soft blur-3xl"
            />
            <IconChip className="h-6 w-6 text-ember" />
            <h3 className="mt-5 max-w-md font-display text-2xl font-medium tracking-tight">
              The whole model runs on your Mac.
            </h3>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
              Koegaki transcribes with {SITE.engine}. There is no server to send your voice to,
              because there is no server. Your words are yours.
            </p>
            <p className="mt-5 font-mono text-xs text-faint">{SITE.engine}</p>
          </div>
        </Reveal>

        {SMALL.map(({ icon: Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 80}>
            <div className="h-full rounded-xl border border-hairline bg-surface/40 p-7">
              <Icon className="h-5 w-5 text-ember" />
              <h3 className="mt-4 font-display text-lg font-medium tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
