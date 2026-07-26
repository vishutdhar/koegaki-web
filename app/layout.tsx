import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { SITE } from "@/lib/site";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} · ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    images: ["/og.png"],
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=navigator.userAgentData&&navigator.userAgentData.platform;var s=d||navigator.platform||navigator.userAgent||"";if(/win/i.test(s))document.documentElement.setAttribute("data-os","win")}catch(e){}})()`,
          }}
        />
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
