/**
 * Signature motif: the ember "voice line" — a thin waveform that runs as the page's
 * connective tissue between sections. Static (CSS-only) bars so it costs nothing and
 * respects reduced motion by default; the hero demo carries the live animation.
 */
const BARS = [
  3, 6, 10, 7, 13, 18, 11, 22, 14, 28, 17, 9, 20, 33, 16, 24, 12, 7, 19, 30, 15, 9, 5, 11, 21, 14,
  8, 17, 26, 12, 6, 10, 4, 8, 15, 23, 13, 7, 11, 5,
];

export function VoiceLine({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex h-9 w-full items-center justify-center gap-[3px] overflow-hidden opacity-70 ${className}`}
    >
      {BARS.map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-ember"
          style={{ height: `${h}px`, opacity: 0.25 + (h / 33) * 0.75 }}
        />
      ))}
    </div>
  );
}
