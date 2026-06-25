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
    "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-medium transition-colors duration-150";
  const styles =
    variant === "primary"
      ? "bg-ember text-base hover:bg-[#f0784f]"
      : "border border-hairline text-ink hover:border-ink/30 hover:bg-surface";
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
