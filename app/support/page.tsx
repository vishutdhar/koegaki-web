import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SITE } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/support",
  title: `Support · ${SITE.name}`,
  description: `Help with ${SITE.name}: what it does, how to reach a person, and how it handles your data.`,
});

/**
 * The support page, and the Mac App Store listing's support URL (Koegaki spec
 * 2026-10-22-mac-app-store-edition, section 18). It stays short: what Koegaki
 * does, the support address and the privacy page. It names no price and links
 * no checkout: a store customer buys in the app.
 */
export default function SupportPage() {
  const link = "text-ink underline underline-offset-4";
  return (
    <>
      <Nav home={false} pricing={false} />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-2xl px-6 py-24 sm:py-28">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">Support</p>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.02em]">
            Help with {SITE.name}.
          </h1>
          <p className="mt-4 text-muted">
            {SITE.name} turns your voice into text on your computer: hold your shortcut, speak, and the words
            appear where you are typing. Nothing you say leaves your computer.
          </p>
          <p className="mt-4 text-muted">
            Questions, problems or ideas: write to{" "}
            <a className={link} href={`mailto:${SITE.contactEmail}`}>
              {SITE.contactEmail}
            </a>{" "}
            and a person reads it.
          </p>
          <p className="mt-4 text-muted">
            How {SITE.name} handles your data:{" "}
            <a className={link} href="/privacy">
              the privacy page
            </a>
            .
          </p>
        </article>
      </main>
      <Footer />
    </>
  );
}
