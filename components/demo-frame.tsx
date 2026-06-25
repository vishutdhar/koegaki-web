import { SITE } from "@/lib/site";

/**
 * Static visual of the dictation moment — an app window with a caret mid-text and the
 * ember "Listening" HUD with a live-meter waveform. Tells the story on its own; also
 * the poster / reduced-motion fallback for the Remotion demo video (DemoVideo).
 */
const METER = [10, 18, 30, 22, 38, 26, 14, 24, 34, 20, 12, 28];

export function DemoFrame() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      {/* ember glow behind the window */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 rounded-[2rem] bg-ember-soft blur-3xl"
      />
      <div className="overflow-hidden rounded-xl border border-hairline bg-card shadow-2xl">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-hairline bg-surface px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-xs text-faint">Notes — untitled</span>
        </div>
        {/* editor */}
        <div className="px-6 py-10 sm:px-10 sm:py-14">
          <p className="font-sans text-lg leading-relaxed text-ink sm:text-xl">
            Koegaki turns your voice into text, instantly and privately
            <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-ember align-middle" />
          </p>
        </div>
      </div>

      {/* floating HUD pill */}
      <div className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-hairline bg-base/90 px-5 py-3 backdrop-blur-md">
        <span className="font-mono text-xs text-muted">Listening</span>
        <span aria-hidden className="flex h-6 items-center gap-[3px]">
          {METER.map((h, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-ember"
              style={{ height: `${h}px`, opacity: 0.5 + (h / 38) * 0.5 }}
            />
          ))}
        </span>
      </div>

      {/* shortcut hint */}
      <p className="mt-12 text-center font-mono text-xs text-faint">
        hold <span className="text-ink">{SITE.mark}</span> · speak · release
      </p>
    </div>
  );
}
