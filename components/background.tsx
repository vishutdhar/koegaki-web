/**
 * Ambient page backdrop: a soft ember aura at the top for depth, plus a faint film
 * grain so the dark never reads as flat black. Fixed + non-interactive; purely visual.
 */
export function Background() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-50 overflow-hidden">
      <div className="absolute left-1/2 top-[-25%] h-[70vh] w-[90vw] max-w-5xl -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(232,100,60,0.12),transparent_62%)] blur-3xl" />
      <div className="bg-grain absolute inset-0 opacity-[0.04] mix-blend-soft-light" />
    </div>
  );
}
