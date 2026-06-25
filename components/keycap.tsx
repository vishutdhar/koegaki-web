import { type ReactNode } from "react";

/** A monospace key-cap chip — mirrors the app's in-product shortcut glyphs. */
export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-hairline bg-card px-2 py-1 font-mono text-xs text-ink shadow-[0_1px_0_rgba(0,0,0,0.5)]">
      {children}
    </kbd>
  );
}
