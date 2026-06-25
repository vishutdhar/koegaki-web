/**
 * Ambient page backdrop: a soft ember aura at the top for depth, plus a faint film
 * grain so the dark never reads as flat black. Fixed + non-interactive; purely visual.
 */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-50 overflow-hidden">
      {/* subliminal blueprint dot grid — a sense of system; fades out at edges */}
      <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(245,239,230,0.05)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_28%,black,transparent_80%)]" />
      {/* ember aura for warmth/depth */}
      <div className="absolute left-1/2 top-[-25%] h-[70vh] w-[90vw] max-w-5xl -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(232,100,60,0.12),transparent_62%)] blur-3xl" />
      {/* film grain */}
      <div className="bg-grain absolute inset-0 opacity-[0.06] mix-blend-soft-light" />
    </div>
  );
}
