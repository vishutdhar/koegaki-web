import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SITE } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/support",
  title: `Support · ${SITE.name}`,
  description: `Help with ${SITE.name}: the permissions it asks for on a Mac, restoring a purchase, and how to reach a person.`,
});

/**
 * The support page, and the Mac App Store listing's support URL (Koegaki spec
 * 2026-10-22-mac-app-store-edition, section 18). It answers a customer of
 * either edition, the download from this site and the Mac App Store edition,
 * and names no price and links no checkout: a store customer buys in the app.
 * The permission names are the app's own words (PermissionCopy in Koegaki).
 */
export default function SupportPage() {
  const email = (
    <a className="text-ink underline underline-offset-4" href={`mailto:${SITE.contactEmail}`}>
      {SITE.contactEmail}
    </a>
  );
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
            Write to {email} and a person reads it. Say which computer and system version you use, and
            whether you got {SITE.name} from this website or from the Mac App Store.
          </p>

          <div className="mt-12 space-y-10">
            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">Permissions on a Mac</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                {SITE.name} asks for the Microphone, so it can hear you while you hold your shortcut, and
                for permission to paste, so your words land in the app you are typing in. The download
                from this website asks for Accessibility to paste.
              </p>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                The Mac App Store edition asks for one permission at a time. Pasting is listed in System
                Settings under Privacy and Security, Device Control and Data Access (Accessibility before
                macOS 27). When your shortcut is Fn or a single modifier key, it also asks for Input
                Monitoring, so it can see that key. It watches only the modifier keys, never the letters
                you type. If you switch a permission on in System Settings after its prompt, choose
                Restart Koegaki in the {SITE.name} window, and macOS applies it when {SITE.name} starts
                again.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">Your purchase</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                Bought in the Mac App Store edition: open the {SITE.name} window, choose License, then
                Restore Purchases, signed in with the Apple Account you bought it with. Bought from this
                website: your license key is in the purchase email, and you enter it in the {SITE.name}{" "}
                window under License.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">Privacy</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                Your voice and your text stay on your computer. The{" "}
                <a className="text-ink underline underline-offset-4" href="/privacy">
                  privacy page
                </a>{" "}
                lists everything {SITE.name} sends over the network, for each edition.
              </p>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
