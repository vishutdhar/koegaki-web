import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${SITE.name} handles your data: it doesn't. Voice and transcripts never leave your Mac.`,
};

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-2xl px-6 py-24 sm:py-28">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">Privacy</p>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.02em]">
            Your voice never leaves your Mac.
          </h1>
          <p className="mt-4 text-muted">
            {SITE.name} is built so that privacy isn&apos;t a policy you have to trust. It&apos;s
            how the app works.
          </p>

          <div className="mt-12 space-y-10">
            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">
                Your audio and transcripts
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                Speech recognition runs entirely on your device. Your microphone audio and the
                text it produces are processed locally and are never uploaded, stored on a
                server, or sent to us or any third party. There is no account to create.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">
                When it uses the network
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                On first launch, {SITE.name} downloads its speech model so dictation can then
                run offline. Dictation itself needs no internet connection at all. Beyond that,
                the app talks to the network to verify your license key (at activation, then a
                quiet daily check while licensed), to check koegaki.com for new versions, and,
                when an update installs, to download the new app package from our hosting
                storage. The license and update checks carry only license and version
                metadata; the update download is the app itself. None of this ever includes
                audio or transcripts.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">This website</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                koegaki.com uses privacy-friendly, cookieless analytics to count visits. It does
                not track you across sites or build a profile. Purchases are handled by our
                payment provider, which processes your payment details. We never see your card.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg font-medium tracking-tight">Questions</h2>
              <p className="mt-2.5 text-sm leading-relaxed text-muted">
                Email{" "}
                <a className="text-ink underline underline-offset-4" href={`mailto:${SITE.contactEmail}`}>
                  support
                </a>{" "}
                any time.
              </p>
            </section>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
