import { ifLinux, lastModified, LINUX_COPY_DATE, LINUX_RELEASE, SITE, type LinuxRelease } from "./site";
import type { ProseSection } from "@/components/subpage/prose";
import type { FaqItem } from "@/components/faq";

/**
 * The secondary landing pages: one per way a visitor might describe what they
 * are looking for (a Mac app, a Windows app, dictation that works offline, and
 * a Linux app once a Linux release exists).
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

/**
 * How Koegaki for Linux updates, said once, on the Linux page. The first Linux
 * release, 1.14.0, ships the Linux updater (Koegaki spec 2026-10-13-linux-updater):
 * the app reads public/linux-updates.json, and Install and restart installs the
 * signed deb through pkexec and dpkg, or shows the download and the one command
 * when it cannot. The check runs as Koegaki starts, when its hidden window
 * loads, and showing the window again does not check (settings.js
 * renderUpdate). The one start that does not check is the restart after an
 * update that did not install, which shows that update's download card from
 * what it was handed (Koegaki spec 2026-10-13-linux-updater rule 6), so the
 * sentence says "when it starts", not "each time". The site tests hold this to
 * the approved sentence for as long as a Linux feed is served
 * (LINUX_UPDATES_IN_APP in tests/site.test.mjs).
 */
export const LINUX_UPDATES =
  "Koegaki for Linux checks for a new version when it starts. Install and restart asks for your password, installs the new version and opens it. If it cannot, it shows the download and the one command to install it yourself. Your settings, history and downloaded models stay as they are.";

/**
 * When the Linux background download waits (Koegaki spec
 * 2026-10-12-linux-platform-gaps rules 6 and 7): NetworkManager's metered
 * verdict, which a user can set for a connection.
 */
const LINUX_WAIT =
  "That background download waits while your computer is on a connection NetworkManager treats as metered, which you can set for a phone hotspot.";

/** The examples of a costly connection, one for each platform the site offers. */
const costlyExamples = ifLinux(
  "such as an iPhone's Personal Hotspot on a Mac, a network you have set as metered in Windows, or one NetworkManager treats as metered on Linux",
  "such as an iPhone's Personal Hotspot on a Mac or a network you have set as metered in Windows",
);

/**
 * The Linux page (docs/specs/2026-10-13-linux-site.md rule 11), made from the
 * Linux release so its commands name that release's file and its digest. Each
 * claim is the Linux build's at Koegaki 62246245: insertion presses Ctrl+V
 * through a uinput keyboard and otherwise leaves the text on the clipboard and
 * says so (spec 2026-10-12-linux-insertion rules 2 and 10); paste access is a
 * uaccess rule at install, writing only, with no log out, taken back on remove
 * (rules 13 and 14); keyboard reading is asked for at setup through pkexec,
 * with the desktop's shortcut dialog as the alternative (rule 15 and
 * docs/linux/evdev-privacy-disclosure.md); the repair command is rule 16's;
 * settings live in ~/.config/koegaki and history, licence and models in
 * ~/.local/share/koegaki (paths.rs); NetworkManager's metered verdict gates the
 * automatic downloads (spec 2026-10-12-linux-platform-gaps rules 6 and 7). The
 * first Linux release, 1.14.0 (Koegaki 6acd2d49), also ships the Linux updater
 * (spec 2026-10-13-linux-updater): the app checks koegaki.com for a new version,
 * and Install and restart downloads the signed deb and asks for the password
 * once to install it, so the update section, the password answer and the
 * network answer say so. Like the Mac and Windows apps since 1.13.0, it
 * downloads the cleanup model by itself once the speech model is in place,
 * waiting on a metered connection (cleanup_service.rs fetch_after_speech), so
 * the network answer lists that download too, as it does Deactivate this
 * computer (license_service.rs deactivate). Let Koegaki paste, offered when
 * paste access is missing, runs the helper through pkexec and so asks for the
 * password too (device_access_linux.rs run_helper). It never mentions a
 * terminal: terminals paste with Ctrl+Shift+V.
 */
function linuxPage(release: LinuxRelease): LandingPage {
  const deb = `Koegaki-${release.version}-amd64.deb`;
  return {
    path: "/linux",
    linkLabel: "Dictation for Linux",
    operatingSystem: "Debian 12 or later, Ubuntu 22.04 or later",
    lastModified: LINUX_COPY_DATE,
    name: "Koegaki for Linux",
    title: "Dictation app for Linux that runs on your own machine",
    description: `Private dictation for Debian and Ubuntu. Hold a key, speak, and the text lands in the app you were using. Recognition runs on your computer. ${price} one-time.`,
    kicker: "Koegaki for Linux",
    h1: "A dictation app for Linux that keeps your voice on your machine.",
    lede: "Hold your shortcut, talk, release. Koegaki pastes what you said where you were typing, and every word is transcribed on your own computer. No account, no cloud, no subscription.",
    sections: [
      {
        heading: "Dictate into the app you are using",
        paragraphs: [
          "Koegaki waits in the background, in the system tray on desktops that show one. Wherever the cursor is, in a browser, a mail client, a document or a chat, hold your shortcut and speak. When you release it, Koegaki pastes the text where you were typing. If it cannot press the paste keys, it leaves the text on the clipboard for you to paste with Ctrl+V and tells you so.",
          "The default shortcut is Ctrl+Alt+K and you can change it. Hold it to talk, or use toggle mode and press once to start and once to stop.",
        ],
      },
      {
        heading: "What you need",
        paragraphs: [
          "Debian 12 or Ubuntu 22.04 or newer, on a 64-bit Intel or AMD processor (x86_64). Koegaki for Linux is a deb package, so there is no build for distributions that do not install deb packages, or for Arm processors. The model runs on the CPU, so no particular graphics card is needed.",
        ],
      },
      {
        heading: "Install it",
        paragraphs: [
          "Download the package, then install it with apt from the folder you saved it in. apt installs anything else Koegaki needs alongside it.",
          { command: `sudo apt install ./${deb}` },
          "To check the download before you install it, run this in the same folder. It prints the file name and OK when the file is the published package.",
          { command: `echo "${release.sha256}  ${deb}" | sha256sum --check` },
        ],
      },
      {
        heading: "Two permissions, each asked for plainly",
        paragraphs: [
          "Paste access is set up when you install. Koegaki pastes by pressing Ctrl+V for you through a virtual keyboard, so the package lets the person signed in at the computer send key presses that way. It can send key presses, never read them. Pasting works straight after installing, with no need to log out, and removing the package takes the access back.",
          "Keyboard access is your choice. Koegaki has two ways to notice your shortcut. Where your desktop has a shortcut dialog for apps, as KDE Plasma does, Koegaki can ask it to watch for the shortcut and never sees your keyboard at all. Otherwise you can let Koegaki read your keyboard. It asks when you set up the shortcut, never at install, and your system asks for an administrator's password at that moment. Koegaki compares each key with your shortcut in memory and forgets it; nothing it sees is saved or sent anywhere. You can turn keyboard access off in Settings at any time.",
        ],
      },
      {
        heading: "If pasting does not work",
        paragraphs: [
          "Settings shows whether paste access and keyboard access are ready, and names the command that fixes either one when it is not. If paste access is missing, for example because the package's setup step could not finish, this sets it up again:",
          { command: "sudo /usr/libexec/koegaki/koegaki-device-access repair" },
        ],
      },
      {
        heading: "Updates",
        paragraphs: [LINUX_UPDATES],
      },
      {
        heading: "Remove it",
        paragraphs: [
          { command: "sudo apt remove com-vishutdhar-koegaki" },
          "Removing the package takes back paste access and any keyboard access you gave Koegaki. Your settings stay in ~/.config/koegaki, and your history, licence and downloaded models in ~/.local/share/koegaki, so a reinstall picks up where you left off. Delete those two folders to remove them too.",
        ],
      },
      {
        heading: "Transcription happens on your computer",
        paragraphs: [
          `Koegaki transcribes with ${SITE.linuxEngine}. The model downloads once on first launch, and from then on dictation works with no internet connection at all. When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps working. ${LINUX_WAIT} Your audio and your text stay on your machine. Nothing is uploaded and there is no server on our side to upload to.`,
          "A multilingual speech model and an optional cleanup model are separate downloads, and they run on your computer too.",
        ],
      },
      {
        heading: "One purchase, every platform",
        paragraphs: [
          `Koegaki costs ${price} once. Every feature is included, updates are free for life, and one licence covers the Linux, Windows and Mac versions on up to 10 of your own computers. Try everything free for ${SITE.trialDays} days first.`,
        ],
      },
      {
        heading: "Questions",
        paragraphs: [
          `Write to ${SITE.contactEmail}. Say which distribution and desktop you use, and what Settings shows for paste access and keyboard access.`,
        ],
      },
    ],
    faqs: [
      {
        q: "Which Linux distributions does it run on?",
        a: "Debian 12 or Ubuntu 22.04 or newer, on x86_64. Koegaki for Linux is a deb package, so there is no build for distributions that do not install deb packages, or for Arm processors.",
      },
      {
        q: "Why does it ask for my password?",
        a: "Only when you choose something that needs an administrator: keyboard access, setting paste access up again if it is missing, and installing an update. Reading the keyboard needs an administrator's permission, so your system asks for the password when you allow it. If your desktop has a shortcut dialog for apps, you can use that instead, and Koegaki never reads your keyboard. Let Koegaki paste in Settings asks for it when paste access is missing, and Install and restart asks for it once, to install the new version.",
      },
      {
        q: "Does it need an internet connection?",
        a: `Dictation itself never touches the network. The app does go online for a few things that carry no audio and no text: the speech model download on first launch and the cleanup model download that follows it, activating or deactivating a licence key and a quiet daily licence check, a check for a new app version, a daily check for newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working. ${LINUX_WAIT} The cleanup model download waits the same way. Each model downloads once. Being offline never locks a paid licence out.`,
      },
      {
        q: "Is there a subscription?",
        a: `No. Koegaki is ${price} one-time, with a ${SITE.trialDays}-day free trial and free updates for life.`,
      },
    ],
  };
}

export const LANDING_PAGES: LandingPage[] = [
  {
    path: "/mac",
    linkLabel: "Dictation for Mac",
    operatingSystem: "macOS 14.0 or later",
    lastModified: lastModified("2026-10-08"),
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
          "Replacements turn a phrase you say into the text you choose, such as a short word for your email address. They run last, so where both lists match the same words, the replacement wins. Your spellings and your replacements are rules applied on your Mac, the same way every time. With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your Mac. That help makes a word more likely to be heard, not certain, so for a word Koegaki still hears as something else, add a replacement.",
        ],
      },
      {
        heading: "What you need",
        paragraphs: [
          "An Apple Silicon Mac (M1 or later) running macOS 14 or later. Koegaki uses the microphone you already have; a headset or the built-in mic both work. There is nothing else to install.",
        ],
      },
      {
        heading: ifLinux("One purchase, every platform", "One purchase, both platforms"),
        paragraphs: [
          `Koegaki costs ${price} once. There are no tiers and no add-ons: every feature is included, updates are free for life, and one licence covers the ${ifLinux("Mac, Windows and Linux", "Mac and Windows")} versions on up to 10 of your own computers. Try everything free for ${SITE.trialDays} days first.`,
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
        a: "Yes. Add names, products and jargon under Custom words on the Vocabulary page, spelled the way you want them. When Koegaki hears one split, hyphenated or with a different apostrophe, it writes your spelling, so “post hog” becomes PostHog, though a lone lowercase letter, as in “x code”, usually stays a word of its own. This works for terms in Latin, Greek or Cyrillic letters. With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your Mac. For a word Koegaki still hears as something else, add a replacement on the same page.",
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
    lastModified: lastModified("2026-10-08"),
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
          "Replacements turn a phrase you say into the text you choose, such as a short word for your email address. They run last, so where both lists match the same words, the replacement wins. Your spellings and your replacements are rules applied on your PC, the same way every time. With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your PC. That help makes a word more likely to be heard, not certain, so for a word Koegaki still hears as something else, add a replacement.",
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
        heading: ifLinux("One purchase, every platform", "One purchase, both platforms"),
        paragraphs: [
          `Koegaki costs ${price} once. Every feature is included, updates are free for life, and one licence covers the ${ifLinux("Windows, Mac and Linux", "Windows and Mac")} versions on up to 10 of your own computers. Try everything free for ${SITE.trialDays} days first.`,
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
        a: "Yes. Once the speech model has downloaded, dictation runs entirely offline. Dictation itself never touches the network. The app does go online for a few things that carry no audio and no text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a check for a new app version when it starts, a daily check for newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working. That background download waits while your PC is on a connection Windows treats as metered, such as a cellular link or a network you have set as metered, which you can do for a phone hotspot. Each model downloads once, and a cleanup model downloads only when you choose it. Being offline never locks a paid licence out.",
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
  // The Linux page exists only once a Linux release does (spec rule 11).
  ...(LINUX_RELEASE ? [linuxPage(LINUX_RELEASE)] : []),
  {
    path: "/offline-dictation",
    linkLabel: "Offline dictation",
    operatingSystem: ifLinux(
      "macOS 14.0 or later, Windows 10, Windows 11, Debian 12 or later, Ubuntu 22.04 or later",
      "macOS 14.0 or later, Windows 10, Windows 11",
    ),
    lastModified: lastModified("2026-10-05"),
    name: "Offline dictation",
    title: ifLinux("Offline dictation software for Mac, Windows and Linux", "Offline dictation software for Mac and Windows"),
    description: `Dictation that works with no internet connection. The speech model runs on your ${ifLinux("own computer", "Mac or PC")}, so it keeps working on a plane or behind a firewall. ${price} one-time.`,
    kicker: "Offline dictation",
    h1: "Dictation that works with the internet switched off.",
    lede: "Koegaki runs the whole speech model on your computer. Once it is installed, dictation works on a plane, on a train, behind a firewall, and on a document that must not leave the building.",
    sections: [
      {
        heading: "Why most dictation stops working offline",
        paragraphs: [
          "Most dictation tools are a microphone connected to a server. They record you, upload the audio, and wait for a transcript to come back. Lose the connection and they stop. Keep the connection and every word you say passes through someone else's computer.",
          `Koegaki does the recognition itself. The speech model is downloaded once, on first launch, and from then on the app never needs the network to turn speech into text. When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps transcribing. That background download waits while your computer is on a connection it treats as costly, ${costlyExamples}.`,
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
          `A few things, none of them involving audio or text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a daily check with koegaki.com for new app versions and newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working. That background download waits while your computer is on a connection it treats as costly, ${costlyExamples}. Each model downloads once, and a cleanup model downloads only when you choose it. If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline.`,
        ],
      },
      {
        heading: ifLinux("Mac, Windows and Linux, one licence", "Mac and Windows, one licence"),
        paragraphs: [
          ifLinux(
            `Koegaki runs on Apple Silicon Macs with macOS 14 or later, on ${SITE.windowsRequirements.toLowerCase()}, and on Debian 12 or Ubuntu 22.04 or newer (x86_64). It costs ${price} once, covers all three platforms, and includes every future update. Try it free for ${SITE.trialDays} days.`,
            `Koegaki runs on Apple Silicon Macs with macOS 14 or later, and on ${SITE.windowsRequirements.toLowerCase()}. It costs ${price} once, covers both platforms, and includes every future update. Try it free for ${SITE.trialDays} days.`,
          ),
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
        a: ifLinux(
          "Koegaki uses the Parakeet Ultra model on every platform: on the Mac and on Windows since version 1.7.0, and on Linux from its first release. On Mac it runs on the Apple Neural Engine; on Windows and Linux on the CPU. It handles natural speech at a normal pace; pauses are fine.",
          `Koegaki uses the Parakeet Ultra model, the same model on Mac and Windows since version 1.7.0. On Mac it runs on the Apple Neural Engine; on Windows on the CPU. It handles natural speech at a normal pace; pauses are fine.`,
        ),
      },
      {
        q: "Can I use it in a corporate environment that blocks unknown services?",
        a: `Yes, once it is set up. Dictation itself makes no network requests. First launch needs to download a speech model and activation needs to reach our licensing provider, so those hosts must be allowed once. The app connects out only for licence activation and a daily licence check with Lemon Squeezy (our licensing provider), version and model checks with koegaki.com, and downloads of updates from our hosting storage, and model downloads: the list of available models comes from koegaki.com. On Mac every model file comes from our model mirror at koegaki-models.vishutdhar.workers.dev and nowhere else. On ${ifLinux("Windows and Linux", "Windows")} the English speech, voice-detection and cleanup models come from the same mirror, and the multilingual speech model comes from GitHub releases. None of these carry audio or text.`,
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
