import { Section } from "./section";
import { Reveal } from "./reveal";
import { KeyCap } from "./keycap";

const STEPS = [
  {
    n: "01",
    title: "Hold your shortcut",
    body: "Globe, a modifier combo, or any key you pick. It works system-wide via Accessibility.",
  },
  {
    n: "02",
    title: "Speak",
    body: "An ember meter shows it is listening. Talk naturally; pauses are fine.",
  },
  {
    n: "03",
    title: "Release",
    body: "Your words are transcribed on-device and inserted right where you were typing.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works">
      <Reveal>
        <h2 className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-[-0.02em] sm:text-4xl">
          Three keystrokes from voice to text.
        </h2>
      </Reveal>
      <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-8">
        {STEPS.map(({ n, title, body }, i) => (
          <Reveal key={n} delay={i * 90}>
            <div className="relative">
              <span className="font-mono text-sm text-ember">{n}</span>
              <div className="mt-3 h-px w-full bg-hairline" />
              <h3 className="mt-5 font-display text-xl font-medium tracking-tight">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">{body}</p>
              {i === 0 && (
                <div className="mt-4 flex items-center gap-1.5">
                  <KeyCap>🌐</KeyCap>
                  <span className="text-faint">or</span>
                  <KeyCap>⌃</KeyCap>
                  <KeyCap>⌥</KeyCap>
                  <KeyCap>⌘</KeyCap>
                  <KeyCap>D</KeyCap>
                </div>
              )}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
