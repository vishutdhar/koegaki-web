import { type ReactNode } from "react";

/**
 * The one button in the system. Primary = ember fill (download/buy); secondary =
 * hairline outline. Renders an anchor since every CTA navigates (download, checkout).
 */
export function CtaButton({
  href,
  variant = "primary",
  children,
  external = false,
}: {
  href: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
  external?: boolean;
}) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0";
  const styles =
    variant === "primary"
      ? "bg-ember text-base shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_24px_-8px_rgba(232,100,60,0.6)] hover:bg-[#f0784f] hover:shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_12px_32px_-8px_rgba(232,100,60,0.75)]"
      : "border border-white/10 bg-white/[0.03] text-ink shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] hover:border-white/20 hover:bg-white/[0.06]";
  return (
    <a
      href={href}
      className={`${base} ${styles}`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
    </a>
  );
}
