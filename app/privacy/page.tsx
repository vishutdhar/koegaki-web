import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { SITE } from "@/lib/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  path: "/privacy",
  title: `Privacy · ${SITE.name}`,
  description: `How ${SITE.name} handles your data: it doesn't. Voice and transcripts never leave your computer.`,
});

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <article className="mx-auto w-full max-w-2xl px-6 py-24 sm:py-28">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember">Privacy</p>
          <h1 className="mt-5 font-display text-4xl font-semibold tracking-[-0.02em]">
            Your voice never leaves your computer.
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
                storage. The app also asks koegaki.com once a day whether a newer speech or cleanup
                model exists, a request that carries nothing but the request itself. A newer cleanup
                model is offered on the Home screen, and nothing downloads until you choose to update
                it. A new speech model arrives only with an app update. When an update brings a new
                version of the speech model you use, the updated app downloads it automatically in
                the background from our model mirror, a download of several hundred megabytes, and
                you keep dictating on your current model until the new one is ready. That download
                is a plain request for the model files, carries nothing about you or your
                dictations, and uses only the internet connection you already have. That
                download, and the download of a cleanup model you turned on when the app has to
                fetch it at launch, waits while your computer is on a connection it treats as
                costly, and starts by itself once you are back on an ordinary connection. On a Mac,
                that includes an iPhone&apos;s Personal Hotspot and Low Data Mode; in Windows, a
                cellular link and any network you marked as metered, which you can do for a phone
                hotspot. A download you start yourself, and the first download after
                you install, go ahead on any connection. The license and update checks carry only
                license and version metadata; the update download is the app itself. None of this
                ever includes audio or transcripts.
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
