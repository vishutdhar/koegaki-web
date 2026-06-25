import { type ReactNode } from "react";

/**
 * Shared section wrapper: consistent max-width + vertical rhythm. An optional mono
 * eyebrow encodes what the section is (a small structural label, not decoration).
 */
export function Section({
  id,
  eyebrow,
  children,
  className = "",
}: {
  id?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-5xl px-6 py-24 sm:py-28 ${className}`}>
      {eyebrow && (
        <p className="mb-5 font-mono text-xs uppercase tracking-[0.2em] text-ember">{eyebrow}</p>
      )}
      {children}
    </section>
  );
}
