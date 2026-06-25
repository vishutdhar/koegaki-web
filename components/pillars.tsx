import { Section } from "./section";
import { Reveal } from "./reveal";
import { IconShield, IconBolt, IconCursor } from "./icons";

const PILLARS = [
  {
    icon: IconShield,
    title: "Private by design",
    body: "The speech model runs entirely on your Mac. No account, no cloud, no audio or text ever leaves your machine.",
  },
  {
    icon: IconBolt,
    title: "Instant",
    body: "A streaming on-device model and a warm microphone mean text appears the moment you speak. No spinner, no upload, no wait.",
  },
  {
    icon: IconCursor,
    title: "Effortless",
    body: "Hold a key, talk, release. Your words land wherever the cursor is — any app, any text field. Nothing to set up.",
  },
];

export function Pillars() {
  return (
    <Section id="why" eyebrow="Why Koegaki">
      <Reveal>
        <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
          Dictation that feels like the Mac built it in.
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-hairline bg-hairline sm:grid-cols-3">
        {PILLARS.map(({ icon: Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 90} className="bg-base">
            <div className="h-full bg-surface/40 p-7">
              <Icon className="h-6 w-6 text-ember" />
              <h3 className="mt-5 font-display text-lg font-medium tracking-tight">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
