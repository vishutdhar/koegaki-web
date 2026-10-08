import { SITE } from "./site";
import type { ProseSection } from "@/components/subpage/prose";
import type { FaqItem } from "@/components/faq";

/**
 * The secondary landing pages: one per way a visitor might describe what they
 * are looking for (a Mac app, a Windows app, dictation that works offline).
 * Everything on these pages is a claim about what Koegaki does today, so each
 * string is checked against the shipping app, and nothing here describes a
 * feature the app does not have.
 */
export type LandingPage = {
  path: string;
  /** Short name used in breadcrumbs and the browser tab. */
  name: string;
  /** Anchor text for the site-wide footer link to this page. */
  linkLabel: string;
  /** The SoftwareApplication operatingSystem for this page's product graph. */
  operatingSystem: string;
  /** Sitemap lastmod: the date this page's content last changed (YYYY-MM-DD). */
  lastModified: string;
  /** The <title>, written as the visitor's search, then the answer. */
  title: string;
  description: string;
  kicker: string;
  h1: string;
  lede: string;
  sections: ProseSection[];
  faqs: FaqItem[];
};

const price = `$${SITE.priceUSD}`;

export const LANDING_PAGES: LandingPage[] = [
  {
    path: "/mac",
    linkLabel: "Dictation for Mac",
    operatingSystem: "macOS 14.0 or later",
    lastModified: "2026-10-05",
    name: "Koegaki for Mac",
    title: "Dictation app for Mac that runs on-device",
    description: `Private dictation for macOS. Hold a key, speak, and the text lands in almost any app. The model runs on your Mac, so your voice never leaves it. ${price} one-time.`,
    kicker: "Koegaki for Mac",
    h1: "A dictation app for Mac that keeps your voice on your Mac.",
    lede: `Hold a shortcut, talk, release. Koegaki types what you said into whatever app you were using, and every word is transcribed on your own machine. No account, no cloud, no subscription.`,
    sections: [
      {
        heading: "Dictate into any Mac app",
        paragraphs: [
          "Koegaki waits in the menu bar. Wherever the cursor is, in Mail, Slack, Notes, a browser, a code editor, hold your shortcut and speak. When you release the key, the text is inserted right where you were typing. There is no window to switch to and, in almost every app, nothing to paste; if an app refuses the insertion, Koegaki leaves the text on the clipboard and tells you.",
          "You choose the shortcut. Hold it to talk, or switch to toggle mode and press it once to start and once to stop, for longer stretches where holding a key would get in the way.",
        ],
      },
      {
        heading: "The speech model runs on your Mac",
        paragraphs: [
          `Koegaki transcribes with ${SITE.engine}. The model downloads once, on first launch, and after that dictation works with the network cable unplugged. When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps working. That background download waits while your Mac is on a connection it treats as costly, such as an iPhone's Personal Hotspot or a network with Low Data Mode turned on. Your audio and the text it becomes are never uploaded, never stored on a server, and never seen by us.`,
          "That is the whole reason the app exists. Most dictation apps send your voice to a server because that is the easy way to build one. Apple Silicon is fast enough that it no longer has to be, and Koegaki uses the Neural Engine so transcription feels instant. A multilingual speech model and an optional cleanup model are separate downloads, and they run on your Mac too.",
        ],
      },
      {
        heading: "Your words, spelled your way",
        paragraphs: [
          "The Vocabulary page holds two lists. Custom words are the names, products and jargon you use, one per row, spelled exactly as you want them. When Koegaki hears one split into separate words, hyphenated, or with an apostrophe left out or changed, it writes your spelling, so “post hog” becomes PostHog.",
          "A lone lowercase letter stays a word of its own unless your spelling keeps it apart or every word is a single letter, so “x code” stays as it is, while “X code” becomes Xcode and “a w s” becomes AWS. Koegaki also fixes the capitals of a name like GitHub or Freedom Terminal, so “github” becomes GitHub. A single word that is all capitals or capitalised only at its start, such as US or Swift, is never rewritten for case alone, so “tell us now” stays as it is. Custom words apply to terms written in Latin, Greek or Cyrillic letters.",
          "Replacements turn a phrase you say into the text you choose, such as a short word for your email address. They run last, so where both lists match the same words, the replacement wins. Both lists are rules applied on your Mac, the same way every time. They change how words are written, not what Koegaki hears: a custom word fixes a term Koegaki already hears in some form, and a word it hears as something else needs a replacement.",
        ],
      },
      {
        heading: "What you need",
        paragraphs: [
          "An Apple Silicon Mac (M1 or later) running macOS 14 or later. Koegaki uses the microphone you already have; a headset or the built-in mic both work. There is nothing else to install.",
        ],
      },
      {
        heading: "One purchase, both platforms",
        paragraphs: [
          `Koegaki costs ${price} once. There are no tiers and no add-ons: every feature is included, updates are free for life, and one licence covers the Mac and Windows versions on up to 10 of your own computers. Try everything free for ${SITE.trialDays} days first.`,
        ],
      },
    ],
    faqs: [
      {
        q: "Does Koegaki work on Intel Macs?",
        a: "The current Mac build is for Apple Silicon (M1 and later) on macOS 14 or later, where the model runs on the Neural Engine. It does not run on Intel Macs.",
      },
      {
        q: "Is this different from the dictation built into macOS?",
        a: "Yes. macOS Dictation is toggled on and off and stops on its own after 30 seconds of silence. Koegaki is push-to-talk with a shortcut you choose, works the same way in every app, and lets you add custom words and replacements. The full comparison is on the Koegaki vs macOS Dictation page.",
      },
      {
        q: "Can I add my own words?",
        a: "Yes. Add names, products and jargon under Custom words on the Vocabulary page, spelled the way you want them. When Koegaki hears one split, hyphenated or with a different apostrophe, it writes your spelling, so “post hog” becomes PostHog, though a lone lowercase letter, as in “x code”, usually stays a word of its own. This works for terms in Latin, Greek or Cyrillic letters, and it changes how a word is written, not what Koegaki hears, so for a word it hears as something else, add a replacement on the same page.",
      },
      {
        q: "Does it need an internet connection?",
        a: "Dictation itself never touches the network. The app does go online for a few things that carry no audio and no text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a daily check for new app versions and newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working. That background download waits while your Mac is on a connection it treats as costly, such as an iPhone's Personal Hotspot or a network with Low Data Mode turned on. Each model downloads once, and a cleanup model downloads only when you choose it. Being offline never locks a paid licence out.",
      },
      {
        q: "Is there a subscription?",
        a: `No. Koegaki is ${price} one-time, with a ${SITE.trialDays}-day free trial and free updates for life.`,
      },
    ],
  },
  {
    path: "/windows",
    linkLabel: "Dictation for Windows",
    operatingSystem: "Windows 10, Windows 11",
    lastModified: "2026-10-05",
    name: "Koegaki for Windows",
    title: "Dictation software for Windows that works offline",
    description: `Private dictation for Windows 10 and 11. Hold a key, speak, and the text lands in almost any program. Recognition runs on your PC, not the cloud. ${price} one-time.`,
    kicker: "Koegaki for Windows",
    h1: "Dictation software for Windows that never sends your voice anywhere.",
    lede: `Hold Ctrl+Alt+D, talk, release. Koegaki types what you said where you were typing, and every word is transcribed on your own PC. No account, no cloud, no subscription.`,
    sections: [
      {
        heading: "Dictate into the program you are using",
        paragraphs: [
          "Koegaki sits in the system tray. Wherever the cursor is, in Outlook, Word, Teams, a browser, a terminal, hold the shortcut and speak. When you release the key the text is inserted where you were typing. Nothing to open, nothing to paste. The one exception is a program running as administrator: Windows does not let an ordinary app type into it, so Koegaki copies the text for you to paste instead, and tells you if even that fails.",
          "The default shortcut is Ctrl+Alt+D and you can change it. Hold it to talk, or use toggle mode and press once to start and once to stop.",
        ],
      },
      {
        heading: "Transcription happens on your PC",
        paragraphs: [
          `Koegaki transcribes with ${SITE.windowsEngine}. The model downloads once on first launch, and from then on dictation works with no internet connection at all. When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps working. That background download waits while your PC is on a connection Windows treats as metered, such as a cellular link or a network you have set as metered, which you can do for a phone hotspot. Your audio and your text stay on your machine. Nothing is uploaded and there is no server on our side to upload to.`,
          "The voice typing built into Windows sends your speech to Microsoft's servers to be recognised. Koegaki does the recognition locally, which is why it can be used on documents you would never paste into a website. A multilingual speech model and an optional cleanup model are separate downloads, and they run on your PC too.",
        ],
      },
      {
        heading: "Your words, spelled your way",
        paragraphs: [
          "The Vocabulary page holds two lists. Custom words are the names, products and jargon you use, one per row, spelled exactly as you want them. When Koegaki hears one split into separate words, hyphenated, or with an apostrophe left out or changed, it writes your spelling, so “post hog” becomes PostHog.",
          "A lone lowercase letter stays a word of its own unless your spelling keeps it apart or every word is a single letter, so “x code” stays as it is, while “X code” becomes Xcode and “a w s” becomes AWS. Koegaki also fixes the capitals of a name like GitHub or Freedom Terminal, so “github” becomes GitHub. A single word that is all capitals or capitalised only at its start, such as US or Swift, is never rewritten for case alone, so “tell us now” stays as it is. Custom words apply to terms written in Latin, Greek or Cyrillic letters.",
          "Replacements turn a phrase you say into the text you choose, such as a short word for your email address. They run last, so where both lists match the same words, the replacement wins. Both lists are rules applied on your PC, the same way every time. With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your PC. For a word Koegaki still hears as something else, add a replacement.",
        ],
      },
      {
        heading: "What you need",
        paragraphs: [
          `${SITE.windowsRequirements}. The model runs on the CPU, so no particular graphics card is needed; a laptop from the last few years is plenty.`,
          "The installer is not yet signed with a certificate, so Windows shows its SmartScreen warning the first time you run it. Usually you choose More info, then Run anyway. On a PC with Smart App Control switched on there is no Run anyway and the installer is refused; that setting can only be turned off in Windows Security, so if you would rather not, write to us and wait for the signed build. The warning is about the missing certificate, not about anything found in the app.",
        ],
      },
      {
        heading: "One purchase, both platforms",
        paragraphs: [
          `Koegaki costs ${price} once. Every feature is included, updates are free for life, and one licence covers the Windows and Mac versions on up to 10 of your own computers. Try everything free for ${SITE.trialDays} days first.`,
        ],
      },
    ],
    faqs: [
      {
        q: "Is this different from Windows voice typing (Win+H)?",
        a: "Yes. Windows voice typing sends your speech to Microsoft's online speech service and is toggled on and off. Koegaki transcribes speech on your PC and is push-to-talk with a shortcut you choose. It also lets you add custom words and replacements. The full comparison is on the Koegaki vs Windows Voice Typing page.",
      },
      {
        q: "Can I add my own words?",
        a: "Yes. Add names, products and jargon under Custom words on the Vocabulary page, spelled the way you want them. When Koegaki hears one split, hyphenated or with a different apostrophe, it writes your spelling, so “post hog” becomes PostHog, though a lone lowercase letter, as in “x code”, usually stays a word of its own. This works for terms in Latin, Greek or Cyrillic letters. With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your PC. For a word Koegaki still hears as something else, add a replacement on the same page.",
      },
      {
        q: "Does it work without internet?",
        a: "Yes. Once the speech model has downloaded, dictation runs entirely offline. Dictation itself never touches the network. The app does go online for a few things that carry no audio and no text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a daily check for new app versions and newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working. That background download waits while your PC is on a connection Windows treats as metered, such as a cellular link or a network you have set as metered, which you can do for a phone hotspot. Each model downloads once, and a cleanup model downloads only when you choose it. Being offline never locks a paid licence out.",
      },
      {
        q: "Which versions of Windows are supported?",
        a: `${SITE.windowsRequirements}.`,
      },
      {
        q: "Is there a subscription?",
        a: `No. Koegaki is ${price} one-time, with a ${SITE.trialDays}-day free trial and free updates for life.`,
      },
    ],
  },
  {
    path: "/offline-dictation",
    linkLabel: "Offline dictation",
    operatingSystem: "macOS 14.0 or later, Windows 10, Windows 11",
    lastModified: "2026-10-05",
    name: "Offline dictation",
    title: "Offline dictation software for Mac and Windows",
    description: `Dictation that works with no internet connection. The speech model runs on your Mac or PC, so it keeps working on a plane or behind a firewall. ${price} one-time.`,
    kicker: "Offline dictation",
    h1: "Dictation that works with the internet switched off.",
    lede: "Koegaki runs the whole speech model on your computer. Once it is installed, dictation works on a plane, on a train, behind a firewall, and on a document that must not leave the building.",
    sections: [
      {
        heading: "Why most dictation stops working offline",
        paragraphs: [
          "Most dictation tools are a microphone connected to a server. They record you, upload the audio, and wait for a transcript to come back. Lose the connection and they stop. Keep the connection and every word you say passes through someone else's computer.",
          "Koegaki does the recognition itself. The speech model is downloaded once, on first launch, and from then on the app never needs the network to turn speech into text. When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps transcribing. That background download waits while your computer is on a connection it treats as costly, such as an iPhone's Personal Hotspot on a Mac or a network you have set as metered in Windows.",
        ],
      },
      {
        heading: "Where offline dictation matters",
        paragraphs: [
          "Legal, medical and financial documents that policy says may not be pasted into a web service. Client work under an NDA. Flights and trains. Offices where the firewall blocks unknown services. A home connection that drops. In every case Koegaki keeps typing what you say.",
          "It also means there is nothing to sign up for. There is no account, no login, and no usage cap, because there is no server counting your words.",
        ],
      },
      {
        heading: "What still uses the network",
        paragraphs: [
          "A few things, none of them involving audio or text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a daily check with koegaki.com for new app versions and newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working. That background download waits while your computer is on a connection it treats as costly, such as an iPhone's Personal Hotspot on a Mac or a network you have set as metered in Windows. Each model downloads once, and a cleanup model downloads only when you choose it. If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline.",
        ],
      },
      {
        heading: "Mac and Windows, one licence",
        paragraphs: [
          `Koegaki runs on Apple Silicon Macs with macOS 14 or later, and on ${SITE.windowsRequirements.toLowerCase()}. It costs ${price} once, covers both platforms, and includes every future update. Try it free for ${SITE.trialDays} days.`,
        ],
      },
    ],
    faqs: [
      {
        q: "Does dictation really work with no internet at all?",
        a: "Yes. After the first-launch model download, you can disconnect from every network and Koegaki keeps transcribing. There is no fallback to a cloud service, because there is no cloud service.",
      },
      {
        q: "How accurate is offline recognition?",
        a: `Koegaki uses the Parakeet Ultra model, the same model on Mac and Windows since version 1.7.0. On Mac it runs on the Apple Neural Engine; on Windows on the CPU. It handles natural speech at a normal pace; pauses are fine.`,
      },
      {
        q: "Can I use it in a corporate environment that blocks unknown services?",
        a: "Yes, once it is set up. Dictation itself makes no network requests. First launch needs to download a speech model and activation needs to reach our licensing provider, so those hosts must be allowed once. The app connects out only for licence activation and a daily licence check with Lemon Squeezy (our licensing provider), version and model checks with koegaki.com, and downloads of updates from our hosting storage, and model downloads: the list of available models comes from koegaki.com. On Mac every model file comes from our model mirror at koegaki-models.vishutdhar.workers.dev and nowhere else. On Windows the English speech, voice-detection and cleanup models come from the same mirror, and the multilingual speech model comes from GitHub releases. None of these carry audio or text.",
      },
      {
        q: "Is there a word limit?",
        a: "No. There is no account and no server, so there is nothing to meter. Dictate as much as you like.",
      },
    ],
  },
];

export function landingPage(path: string): LandingPage | undefined {
  return LANDING_PAGES.find((p) => p.path === path);
}
