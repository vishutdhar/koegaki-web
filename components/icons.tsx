import { type SVGProps } from "react";

/**
 * Minimal line-icon set — consistent 1.5 stroke, currentColor, 24px grid. Inline SVG
 * (no emoji, no icon dependency) so every glyph shares one optical weight.
 */
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function IconShield(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </svg>
  );
}

export function IconBolt(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z" />
    </svg>
  );
}

export function IconCursor(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M5 4l14 7-6 2-2 6-6-15z" />
    </svg>
  );
}

export function IconApps(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function IconBook(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M5 5a2 2 0 012-2h11v15H7a2 2 0 00-2 2V5z" />
      <path d="M5 19a2 2 0 012-2h11" />
    </svg>
  );
}

export function IconKey(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8 8M16 16l2-2M18.5 18.5l1.5-1.5" />
    </svg>
  );
}

export function IconMenuBar(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18" />
      <path d="M15 7h3" />
    </svg>
  );
}

export function IconChip(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
      <path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2" />
    </svg>
  );
}

export function IconCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M5 12.5l4 4 10-10.5" />
    </svg>
  );
}
