import { SITE } from "./site";
import type { CompareRow } from "@/components/subpage/compare-table";
import type { ProseSection } from "@/components/subpage/prose";
import type { FaqItem } from "@/components/faq";

/**
 * Comparison pages. Each one sets Koegaki beside one alternative a visitor is
 * likely to be weighing. The rows are facts about what each product does,
 * checked against the other vendor's own published pages on the `asOf` date,
 * and they are re-checked when that vendor changes. Adjectives about the other
 * product do not belong here; the visitor draws the conclusion.
 */
export type Comparison = {
  slug: string;
  other: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  asOf: string;
  rows: CompareRow[];
  sections: ProseSection[];
  faqs: FaqItem[];
};

const price = `$${SITE.priceUSD} one-time`;
const trial = `${SITE.trialDays}-day free trial`;

const koegakiCommon = {
  where: "On your own computer. The speech model runs locally; audio and text never leave it.",
  account: "None. No sign-up, no login.",
  price: `${price}, ${trial}. Every feature included, free updates for life.`,
  platforms: "macOS 14+ and Windows 10 & 11, one licence for both.",
  trigger: "Hold a shortcut you choose (push-to-talk), or toggle with one press.",
  vocab: "Word replacements: say a short word, Koegaki types the full phrase.",
  offline: "Yes. After the one-time model download, dictation needs no network.",
};

export const COMPARISONS: Comparison[] = [
  {
    slug: "superwhisper",
    other: "Superwhisper",
    title: "Koegaki vs Superwhisper: private dictation, one price",
    description:
      "Both can transcribe on your Mac. Koegaki is $30 once with every feature included; Superwhisper has a free tier, with its on-device Parakeet models in the paid tier.",
    h1: "Koegaki vs Superwhisper",
    lede:
      "Both apps can transcribe on your own machine. The differences are what you pay, what is behind the paywall, and how much app you get.",
    asOf: "September 2026",
    rows: [
      { label: "Where your voice is processed", koegaki: koegakiCommon.where, other: "On your device with local models, or in the cloud with the cloud models it also offers." },
      { label: "On-device models", koegaki: "Included. An English model (Parakeet) and a multilingual model (Whisper), both local, at no extra cost.", other: "Some local models are free; the Parakeet models need the paid Pro tier." },
      { label: "Price", koegaki: koegakiCommon.price, other: "Free tier with some local models; Pro (monthly, yearly or lifetime) for Parakeet and the rest. Current prices are on superwhisper.com." },
      { label: "Platforms", koegaki: koegakiCommon.platforms, other: "macOS, Windows and iOS." },
      { label: "How you trigger it", koegaki: koegakiCommon.trigger, other: "Configurable shortcut with push-to-talk and toggle." },
      { label: "AI rewriting modes", koegaki: "Optional, off by default, and local: a cleanup model that runs on your own machine. Nothing is sent anywhere.", other: "Yes, modes that rewrite your text with local or cloud language models." },
      { label: "Works offline", koegaki: koegakiCommon.offline, other: "Yes with local models." },
    ],
    sections: [
      {
        heading: "What Koegaki does differently",
        paragraphs: [
          "Koegaki has one job: turn what you say into text, on your machine, where you were typing. Every model it runs is local. There is one price and it covers everything, on Mac and on Windows. That makes it a smaller app than Superwhisper, and that is the point.",
          "If you want a dozen modes for different apps, Superwhisper offers that. Koegaki types what you said by default; an optional cleanup pass exists, it is off until you switch it on, and it runs on your machine. The words you say appear where your cursor was, with nothing between your microphone and your document.",
        ],
      },
      {
        heading: "Why the price is one number",
        paragraphs: [
          `Local speech recognition costs nothing to run once it is on your computer, so there is no server bill to pass on. Koegaki is ${price}, and a ${trial} means you know it works for you before you pay.`,
        ],
      },
    ],
    faqs: [
      { q: "Is Koegaki cheaper than Superwhisper?", a: `Koegaki is ${price} with every feature included. Superwhisper has a free tier with some local models; its Parakeet models and other Pro features are a subscription or a lifetime licence, and current amounts are on its pricing page.` },
      { q: "Does Koegaki have AI modes like Superwhisper?", a: "Not modes. Koegaki transcribes what you say and inserts it. There is one optional cleanup pass, off by default, and when it is on it runs on your own machine; your text is never sent to a service." },
      { q: "Can I switch from Superwhisper to Koegaki?", a: `Yes. Install Koegaki, choose a shortcut, and dictate. The ${trial} needs no card and no account.` },
    ],
  },
  {
    slug: "wispr-flow",
    other: "Wispr Flow",
    title: "Koegaki vs Wispr Flow: on-device dictation instead of the cloud",
    description:
      "Wispr Flow recognises your speech on its servers, with a free tier capped on desktop and paid plans above it. Koegaki does it on your Mac or PC, never uploads your voice, and costs $30 once.",
    h1: "Koegaki vs Wispr Flow",
    lede:
      "Wispr Flow is cloud dictation with AI editing. Koegaki is local dictation with nothing in between. That one difference decides most of the others.",
    asOf: "September 2026",
    rows: [
      { label: "Where your voice is processed", koegaki: koegakiCommon.where, other: "On Wispr's servers. Audio is uploaded for recognition." },
      { label: "Offline mode", koegaki: koegakiCommon.offline, other: "No offline transcription at any tier. On desktop, a recording that failed to send can be retried from History after you reconnect." },
      { label: "Price", koegaki: koegakiCommon.price, other: "Monthly subscription per user, with a free tier capped at a weekly word count on desktop and iPhone. Current prices are on wisprflow.ai." },
      { label: "Platforms", koegaki: koegakiCommon.platforms, other: "macOS, Windows, iOS and Android." },
      { label: "Account required", koegaki: koegakiCommon.account, other: "Yes; plans are per user." },
      { label: "AI rewriting", koegaki: "Optional, off by default, and local: a cleanup model that runs on your own machine. Nothing is sent anywhere.", other: "Yes, the transcript is cleaned up and reformatted by Wispr's models." },
      { label: "Custom vocabulary", koegaki: koegakiCommon.vocab, other: "Dictionary of terms it learns to recognise." },
      { label: "Word limit", koegaki: "None. There is no server to meter you.", other: "Free tier is capped at a weekly word count on desktop; paid plans are unlimited." },
    ],
    sections: [
      {
        heading: "The trade Wispr Flow asks you to make",
        paragraphs: [
          "Wispr Flow is good at what it does, and what it does is send your voice to a server, recognise it there, tidy it with a language model, and send text back. That is why it needs an account and an internet connection, why the free tier is capped at a weekly word count on desktop with a paid plan above it, and why every sentence you dictate passes through a company's infrastructure.",
          "Koegaki makes the opposite trade. Recognition runs on your computer with a model that is downloaded once. There is no account because there is nothing to log in to, no subscription because there is no server to pay for, and no word limit because nothing is counting.",
        ],
      },
      {
        heading: "What you give up",
        paragraphs: [
          "By default Koegaki types what you said, with punctuation, and stops. Its optional cleanup pass is off until you switch it on, and it runs on your own machine. If you rely on a cloud AI pass to turn rambling into polished prose, Wispr Flow is built around that and Koegaki is not.",
        ],
      },
    ],
    faqs: [
      { q: "Does Wispr Flow have an offline mode?", a: "As of September 2026, Wispr Flow does not transcribe offline at any tier: recognition runs on its servers, and on desktop a recording that failed to send can be retried from History after you reconnect. Koegaki transcribes entirely on your computer." },
      { q: "Is Koegaki a subscription?", a: `No. ${price}, ${trial}, updates included.` },
      { q: "Does Koegaki clean up my speech like Wispr Flow?", a: "By default it punctuates and inserts what you said. An optional cleanup model can tidy the text, and it runs on your computer; your words are never sent to a service." },
    ],
  },
  {
    slug: "macos-dictation",
    other: "macOS Dictation",
    title: "Koegaki vs macOS Dictation: push-to-talk in every app",
    description:
      "macOS has dictation built in. Koegaki adds a hold-to-talk shortcut that works the same in every app, word replacements, and a model that always runs on your Mac.",
    h1: "Koegaki vs the dictation built into macOS",
    lede:
      "Your Mac can already take dictation. Here is what changes when you use Koegaki instead, and when the built-in one is enough.",
    asOf: "September 2026",
    rows: [
      { label: "Where your voice is processed", koegaki: koegakiCommon.where, other: "On-device for general text in supported languages once the language is downloaded, as shown in Keyboard settings; dictation into search boxes and other languages go to Apple's servers." },
      { label: "How you trigger it", koegaki: koegakiCommon.trigger, other: "A key press toggles dictation on; it stays on until you stop it, or stops after 30 seconds of silence." },
      { label: "Custom vocabulary", koegaki: koegakiCommon.vocab, other: "None documented by Apple for dictation." },
      { label: "Price", koegaki: koegakiCommon.price, other: "Included with macOS." },
      { label: "Windows version", koegaki: "Yes, same licence.", other: "No." },
      { label: "Account required", koegaki: koegakiCommon.account, other: "No." },
    ],
    sections: [
      {
        heading: "When the built-in dictation is enough",
        paragraphs: [
          "If you dictate a sentence now and then, in one language, and you do not mind pressing a key to start and pressing it again to stop, macOS Dictation is free and already there. Use it.",
        ],
      },
      {
        heading: "What Koegaki changes",
        paragraphs: [
          "Hold-to-talk. You hold a key while you speak and let go when you are done, the way you would use a walkie-talkie. Releasing the key ends capture; Koegaki then transcribes and inserts what you said.",
          "The same behaviour across apps. Koegaki inserts text where the cursor is, using one shortcut, in Mail, Slack, a terminal, a browser form; the rare app that refuses insertion gets the text on the clipboard instead.",
          "Word replacements. Say a short word and Koegaki types the full phrase: an email address, a product name it might spell wrong, a signature. And the model is always on your Mac, for every language it supports, with nothing falling back to a server.",
        ],
      },
    ],
    faqs: [
      { q: "Is macOS Dictation private?", a: "Partly. For general text in languages Apple supports on-device, and once the language is downloaded, recognition happens on your Mac; Keyboard settings shows whether it does. Apple says dictation into search boxes is handled differently, and other languages use its servers. Koegaki has no server path at all, so there is nothing to configure and nothing to fall back to." },
      { q: "Can I keep using macOS Dictation alongside Koegaki?", a: "Yes. Koegaki uses its own shortcut and does not change any macOS setting." },
      { q: "Does Koegaki cost money?", a: `Yes, ${price} after a ${trial}. macOS Dictation is free with the system.` },
    ],
  },
  {
    slug: "windows-voice-typing",
    other: "Windows Voice Typing",
    title: "Koegaki vs Windows Voice Typing (Win+H): offline dictation",
    description:
      "Windows voice typing needs the internet because recognition runs on Microsoft's servers. Koegaki recognises speech on your PC, works offline, and adds push-to-talk.",
    h1: "Koegaki vs Windows Voice Typing",
    lede:
      "Press Win+H and Windows will take dictation, as long as you are online. Koegaki does the same job on your own PC, with the network unplugged.",
    asOf: "September 2026",
    rows: [
      { label: "Where your voice is processed", koegaki: koegakiCommon.where, other: "On Microsoft's online speech service. An internet connection is required." },
      { label: "Works offline", koegaki: koegakiCommon.offline, other: "No." },
      { label: "How you trigger it", koegaki: koegakiCommon.trigger, other: "Win+H toggles a voice typing bar on; it stays on until you stop it." },
      { label: "Custom vocabulary", koegaki: koegakiCommon.vocab, other: "None documented by Microsoft." },
      { label: "Price", koegaki: koegakiCommon.price, other: "Included with Windows." },
      { label: "Mac version", koegaki: "Yes, same licence.", other: "No." },
      { label: "Account required", koegaki: koegakiCommon.account, other: "No." },
    ],
    sections: [
      {
        heading: "When Win+H is enough",
        paragraphs: [
          "If you are online, the document is not sensitive, and you only dictate occasionally, Windows voice typing is free and already installed. Use it.",
        ],
      },
      {
        heading: "What Koegaki changes",
        paragraphs: [
          "Your voice stays on your PC. Windows voice typing sends your speech to Microsoft's servers to be recognised. Koegaki runs the speech model locally, so it works on a plane, behind a corporate firewall, and on documents you are not allowed to send anywhere.",
          "Hold-to-talk. Hold Ctrl+Alt+D, or a shortcut you choose, speak, and release. There is no bar to open; releasing the key ends capture, and Koegaki then transcribes and inserts what you said. A program running as administrator is the exception: Windows does not let an ordinary app type into it, so Koegaki copies the text for you to paste.",
          "Word replacements. Say a short word and Koegaki types the full phrase, without teaching anything.",
        ],
      },
    ],
    faqs: [
      { q: "Does Windows voice typing work offline?", a: "No. Microsoft's own documentation says voice typing requires an internet connection because it uses online speech recognition. Koegaki works offline after its one-time model download." },
      { q: "Does Koegaki need a graphics card?", a: "No. On Windows the model runs on the CPU; a laptop from the last few years is plenty." },
      { q: "Does Koegaki cost money?", a: `Yes, ${price} after a ${trial}. Windows voice typing is free with the system.` },
    ],
  },
];

export function comparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
