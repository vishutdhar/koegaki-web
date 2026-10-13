import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { LINUX_RELEASE, SITE } from "@/lib/site";
import { OPEN_GRAPH_DEFAULTS } from "@/lib/metadata";
import { Background } from "@/components/background";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

/**
 * The pre-paint platform stamp (see the head below). Without a Linux release
 * it stamps Windows only, as it always has. With one it also stamps Linux:
 * a Linux platform string that is not Android, whose browsers report one
 * ("Linux armv81"), or ChromeOS ("CrOS"), where the deb does not apply, so
 * those visitors keep the Mac variant and its links, as before.
 */
const PLATFORM_STAMP = LINUX_RELEASE
  ? `(function(){try{var d=navigator.userAgentData&&navigator.userAgentData.platform;var s=d||navigator.platform||navigator.userAgent||"";var h=document.documentElement;if(/win/i.test(s))h.setAttribute("data-os","win");else if(/linux/i.test(s)&&!/android|cros/i.test(s+" "+(navigator.userAgent||"")))h.setAttribute("data-os","linux")}catch(e){}})()`
  : `(function(){try{var d=navigator.userAgentData&&navigator.userAgentData.platform;var s=d||navigator.platform||navigator.userAgent||"";if(/win/i.test(s))document.documentElement.setAttribute("data-os","win")}catch(e){}})()`;

/**
 * What the Linux stamp needs from the stylesheet, only with a Linux release:
 * the Linux variant hides off Linux, the Mac variant on Linux, and the PC
 * variant, shown on Windows and Linux, on the Mac. Like globals.css's two
 * rules, each only ever adds display:none. It is inline, not in globals.css,
 * so the stylesheet without a Linux release is the one the site has today.
 */
const LINUX_PLATFORM_STYLE =
  'html:not([data-os="linux"]) .os-linux{display:none}[data-os="linux"] .os-mac{display:none}html:not([data-os="win"]):not([data-os="linux"]) .os-pc{display:none}';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} · ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  // Pages that set their own openGraph replace this object entirely, which is
  // why they build theirs with pageMetadata (lib/metadata.ts) from the same defaults.
  openGraph: {
    ...OPEN_GRAPH_DEFAULTS,
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.name,
    description: SITE.tagline,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
      // The pre-paint script below adds data-os, which React would otherwise
      // treat as a hydration mismatch and recover from by client-rendering the
      // boundary -- reintroducing the flash the script exists to prevent.
      suppressHydrationWarning
    >
      <head>
        {/*
          Stamp the visitor's platform before first paint so the Mac and Windows
          variants of the download copy never visibly swap. Running this during
          hydration instead would flash the wrong platform in the largest type on
          the page. The markup ships both variants and CSS hides one, so this
          script only chooses; with JavaScript off, the Mac variant stands and
          the Windows download stays reachable as an ordinary link.
        */}
        {/*
          Chosen as a whole, never as a conditional child, so the head without a
          Linux release is byte for byte today's, payload included.
        */}
        {LINUX_RELEASE ? (
          <>
            <script dangerouslySetInnerHTML={{ __html: PLATFORM_STAMP }} />
            <style dangerouslySetInnerHTML={{ __html: LINUX_PLATFORM_STYLE }} />
          </>
        ) : (
          <script dangerouslySetInnerHTML={{ __html: PLATFORM_STAMP }} />
        )}
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {/* No-JS / crawler safety: scroll-reveal elements must never stay hidden. */}
        <noscript>
          <style>{`.reveal{opacity:1 !important;transform:none !important}`}</style>
        </noscript>
        <Background />
        {children}
      </body>
    </html>
  );
}
