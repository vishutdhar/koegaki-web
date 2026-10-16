# The site learns Linux, shown once a Linux release exists

Koegaki mission: the best voice to text transcription app in the world.
Date: 2026-10-13. Branch `vd/20261013-linux-site`, base main `09b3976`. Unit 8 of the Linux release
plan. The first Linux release, 1.14.0, is weeks away, so this unit lands the site code now and gates
every Linux surface on data: a release record under `releases/` that holds a deb. Until that record
exists the site is exactly what it is today.

## 1. Problem

koegaki.com knows two platforms. Its record guards refuse a deb, its Vercel pre-build step refuses
any artifact but a disk image or an installer, it has no Linux download, page or platform stamp, and
the copy names two platforms in the 36 places of section 4. Unit 10 publishes 1.14.0 with
the publish tool, which writes a record holding a deb (Koegaki `Tools/publish-release.sh`, spec
`2026-10-13-publish-tool-linux-and-windows-only` rule 6). That record must turn the site into a
three platform site with no further site code, and nothing Linux may show before it.

## 2. Facts this design rests on

- **The publish tool's deb record** is `artifacts.deb` with exactly `url`, `size`, `sha256`,
  `blake2b512` and `signature`, the url being
  `https://github.com/vishutdhar/koegaki-releases/releases/download/v<ver>/Koegaki-<ver>-amd64.deb`.
  A record lists any non empty subset of dmg, exe and deb (Koegaki `563e2cd9`, publish tool spec
  rule 6, `publish-release.sh` 1037). The signature is required there (`--deb needs --deb-sig`).
- **The deb's updater signature** is a prehashed minisign signature over the deb's BLAKE2b-512
  digest whose trusted comment names `com.vishutdhar.Koegaki_<ver>_amd64.deb`. The Linux build
  trusts the key of `tauri.linux.conf.json` when it sets one and the base `tauri.conf.json` key
  otherwise; the overlay sets none at Koegaki `62246245`, so the Linux key is the Windows key.
- **Two builds of main are byte-identical apart from the build id**, measured on this branch's base:
  all 111 prerendered files (html, rsc, segment rsc, body and meta) and the static asset names. So
  "today's site, unchanged" can be held to the byte.
- **Today's build never says Linux.** No prerendered file and no static asset contains "linux" in
  any case.
- **A route file always builds a page.** A static `app/linux/page.tsx` that calls `notFound()`
  prerenders `/linux` as a bare error document, not the site's 404. A top level dynamic segment with
  no parameters builds nothing, but it adds a route to the routing table and makes the
  `no-html-link-for-pages` lint rule read every top level link as a page. Next's documented dotted
  page extensions avoid both: `app/linux/page.linux.tsx` is a page only while `pageExtensions`
  holds `linux.tsx`, so without it nothing is built or routed and `/linux` is the ordinary 404
  (measured with `next start` beside a build of main: every probed response identical, `/linux`
  included, and the routes and prerender manifests identical).
- **React records a child that renders nothing.** `{cond && <a/>}` leaves the HTML unchanged when
  `cond` is false, but the page's payload, inlined in the HTML, gains a `null` child, so the bytes
  change. Every gate therefore chooses whole elements (`cond ? <p>three</p> : <p>today</p>`), and a
  sentence inside JSX text is gated by writing the paragraph out twice. Class names in gated code
  must already exist in today's stylesheet, since Tailwind scans every source file whether or not
  the code renders; the pin of rule 8 catches either mistake.
- **Next inlines `env` from the config** at build time, so a value the config derives is a literal
  in every bundle, the `/buy` function included, and no runtime code reads the file system.
- **The Linux app** (Koegaki main `62246245`): the default shortcut is Ctrl+Alt+D, hold or toggle
  (corrected 2026-10-15: Koegaki spec `2026-10-13-linux-default-chord` makes the Linux default
  Ctrl+Alt+K, because the Ubuntu GNOME session binds Ctrl+Alt+D to show desktop);
  insertion presses Ctrl+V through a uinput virtual keyboard and, when it cannot, leaves the text on
  the clipboard and says so (insertion spec rules 2 and 10); paste access is granted at install
  through a `uaccess` udev rule, writing only, with no log out (rule 13), and removing the package
  takes it back (rule 14); keyboard reading is asked for at setup, never at install, through pkexec
  and the package's helper, with the desktop shortcut dialog as the alternative where the desktop
  offers one (rule 15, `docs/linux/evdev-privacy-disclosure.md`); the repair command is
  `sudo /usr/libexec/koegaki/koegaki-device-access repair` (rule 16); settings live in
  `~/.config/koegaki`, history, licence and models in `~/.local/share/koegaki` (`paths.rs`);
  NetworkManager's metered verdict gates the automatic downloads (platform gaps rules 6 and 7);
  the Linux build reads the model index's linux block; its update check and install are stubs that
  never reach the network (plan finding 2), so today Linux does not update itself.
- **The release build's floor.** The Ubuntu 22.04 build needs GLIBC 2.34 and loads on Ubuntu 22.04
  and Debian 12 or newer (memory `reference_koegaki_linux_x64_vm`). The dispatch fixes the claim:
  "Debian 12 or Ubuntu 22.04 or newer, x86_64".

## 3. Rules

### Records and guards

1. **A record holds any non empty set of dmg, exe and deb.** The site tests' record check
   (`releaseRecordProblems`) and the Vercel pre-build step accept a deb beside the others and alone:
   dmg only, exe only, deb only, any two, all three. A deb holds exactly `url`, `size`, `sha256`,
   `blake2b512` and `signature`; its url is the release's `Koegaki-<ver>-amd64.deb` asset; its
   signature is a non empty string. Any other artifact kind is refused, as today. This follows the
   publish tool, which writes the signature; a record without one is refused. The pre-build step
   holds every artifact of the record it checks to exactly its kind's fields, as the tests do.
2. **The record's deb signature verifies.** Over the BLAKE2b-512 digest the record states, with the
   Linux updater key, and its trusted comment names `com.vishutdhar.Koegaki_<ver>_amd64.deb`.
3. **`RELEASE_FETCH=1` fetches the deb.** For every release the site serves from GitHub, the Linux
   link's release included, the test downloads every asset its record states, holds each to its
   size, SHA-256 and BLAKE2b-512, and verifies the deb's updater signature over the downloaded
   bytes.
4. **The Linux link is a GitHub asset of a recorded deb.** `SITE.linuxDownloadUrl`, when it is set,
   is exactly the deb asset url of a release whose record states a deb. No other host ever served a
   deb, so there is no legacy form.

### The Linux feed

5. **No Linux feed in this unit.** `public/linux-updates.json` is unit 5's: its signature and its
   platform key are that unit's call. A test fails if a Linux feed appears anywhere in `public/`
   (any file Next would serve, at any depth, under any name or link, that parses as JSON and either
   has a name that says Linux or lists a Linux target among its updater platforms, so a feed shared
   with Windows counts), with "no release record holds a deb"
   while none does, and with "the Linux feed has no checks yet" once one does, so the feed can
   never ship unchecked. What unit 5 needs from the site, so it can replace that test:
   - the feed in the Tauri static shape the Windows feed uses (`version`, `notes`, `pub_date`,
     `platforms`), with the entry under the key the Linux updater reads for a deb install,
     `linux-x86_64-deb` (or `linux-x86_64`, which it reads next), holding `url` and `signature`;
   - a twin of `windowsUpdateProblems` that holds the entry to the record of its version: the url
     is that record's deb url, the signature is that record's deb signature, it verifies over the
     record's BLAKE2b-512 with the Linux key, and its trusted comment names the bundler's file;
   - the feed's version equal to the Linux link's, as the Windows feed's is to the Windows link's;
   - the app's endpoint set in `tauri.linux.conf.json`, and the update sentence of rule 11 changed
     in the same release.

### The gate

6. **The Linux release is the newest record that holds a deb.** `next.config.ts` reads `releases/`
   at build time through `scripts/linux-release.mjs`, picks the highest version whose record holds a
   deb, and inlines it as `KOEGAKI_LINUX_RELEASE` (its version, url, size and sha256), or as an
   empty string when there is none. The build fails when a record cannot be read or parsed, or the
   chosen deb is not the shape of rule 1, rather than guess. `KOEGAKI_RELEASES_DIR` reads another
   folder instead, for the test fixture build only, and is refused when `VERCEL` is set, so no
   deployment can build from it.
7. **SITE gains `linuxDownloadUrl`, `linuxRequirements` and `linuxEngine`**, with
   `LINUX_RELEASE` beside SITE. All are null while there is no Linux release; with one they are the
   deb's url, "Debian 12 or Ubuntu 22.04 or newer · x86_64" and "Parakeet Ultra · on-device (CPU)".
8. **Gated off, today's site to the byte.** With no deb record, every prerendered file and every
   static asset name is the same as main's apart from the build id, nothing in the build output
   says Linux, no file is built for `/linux`, which answers with the site's ordinary 404, and the
   sitemap does not list it. A test pins digests of today's prerendered files, taken from main's
   build (`tests/fixtures/gate-off-pin.json`), with the build id and the two download links read
   as placeholders so a Mac or Windows release does not move it. The pin retires itself once a deb
   record exists. A deliberate change to today's pages refreshes it with
   `UPDATE_GATE_OFF_PIN=1 npm test`. The config differs from today's only by the inlined empty
   value: no page extension, route or output setting moves.

### What appears with a Linux release

9. **Download.** Every download button gains a Linux anchor to the deb (`os-linux`). Each platform
   note names its own requirement and links the other two platforms' downloads; the Linux note also
   links the Linux page's install steps. The footer gains a Linux download beside Mac and Windows.
10. **Platform stamp.** The pre-paint script also stamps `data-os="linux"` for a Linux platform that
    is not Android (whose browsers report a Linux platform string) or ChromeOS, and an inline style
    hides `.os-linux` except on Linux, `.os-mac` on Linux, and `.os-pc`, the word shown on both
    Windows and Linux, on the Mac. With no Linux release the script and the stylesheet are today's,
    byte for byte.
11. **The Linux page, `/linux`**, built with the landing page pattern of `/mac` and `/windows`
    (hero, prose, FAQ, call to action) from `LANDING_PAGES`, so the footer, the sitemap and the
    structured data pick it up. Its route is `app/linux/page.linux.tsx`, a page only while the
    config adds the `linux.tsx` extension, which it does only with a Linux release. It says, in plain words: what it does; what it needs; how to install
    (`sudo apt install ./Koegaki-<ver>-amd64.deb`) and how to check the download against the
    record's SHA-256; the two access grants (paste access at install, writing only; keyboard access
    only if the user chooses it, asked for at setup with a password prompt, with the desktop
    shortcut dialog as the alternative); the one repair command for missing paste access; how
    updates work, from the single constant `LINUX_UPDATES`, which says to download and install the
    new version until the Linux updater ships (unit 10 changes it only if unit 5 has shipped);
    uninstall (`sudo apt remove com-vishutdhar-koegaki`) and where the data stays; privacy and the
    network; the support email. Every command is shown as a command, not as prose. The page shows
    the record's digest, and a test holds the two equal.
12. **Copy sweep.** Every sentence that names two platforms becomes three only with a Linux
    release (table below). The sweep adds Linux examples where a sentence gives one per platform
    (the metered connection examples) and makes no new claim about Mac or Windows.
13. **Sitemap, robots and structured data.** The sitemap lists `/linux` and the home graph's
    operating systems name Linux only with a Linux release. `robots.ts` lists no pages and allows
    every path in both states, so it is unchanged. With a Linux release every page's lastmod is at
    least `LINUX_COPY_DATE`, the day the Linux copy goes live, since every page's footer and most
    pages' copy change that day; unit 10 sets it to the release date.
14. **Copy rules.** No dashes, no emojis, the support address support@freedom-terminal.com, the
    Freedom Terminal footer link, and no claim the Linux app does not make good: no terminal paste
    (Linux terminals paste with Ctrl+Shift+V, the app presses Ctrl+V), no self update, no build
    beyond x86_64 deb, the tray only "on most Linux desktops" (vanilla GNOME shows none).

### Tests

15. **Two builds, one suite.** `npm test` builds a fixture site first (`tests/build-linux-fixture.mjs`:
    `next build` with `KOEGAKI_RELEASES_DIR=tests/fixtures/linux-release`, kept as
    `.next-linux-fixture`), then the real site. `tests/site.test.mjs` runs on the real build, and
    `tests/linux-fixture.test.mjs` runs the same file on the fixture build, where the 1.14.0 record
    of synthetic bytes, signed with a key made for the fixture, joins the real records. Every page
    check (canonical, titles, H1, structured data, custom words, the costly connection sentences,
    the served version) runs on both, and the Linux checks assert every surface of rules 9 to 13.
    The fixture never lands in `releases/` or `public/downloads`, and nothing deploys it.
16. **RED first.** Each rule's test is written and seen failing on main before the code: the record
    and pre-build checks refuse a deb; the derivation module is missing; the fixture build shows no
    Linux surface. The gate-off guards pass on main by design, so each is shown to fail under a
    mutation that leaks a Linux surface or moves a byte.

## 4. Copy sweep

Lines are at main `09b3976`. "Today" stays while no record holds a deb.

| File and line | Today | With a Linux release |
|---|---|---|
| lib/site.ts:12 | "The fastest private dictation for Mac and Windows." | "The fastest private dictation. Mac, Windows, Linux." (the home title must stay within 63 characters) |
| lib/site.ts:14 | "anywhere on your Mac or PC" | "anywhere on Mac, Windows or Linux" |
| components/hero.tsx:13-14 | stamp label Apple Silicon, Windows 10 & 11 | adds Debian & Ubuntu |
| components/hero.tsx:25-26 | "your Mac" or "your PC" (os-win) | "PC" shown on Windows and Linux (os-pc) |
| components/download-cta.tsx:20-29 | two anchors | three anchors |
| components/download-cta.tsx:45-66 | Mac note links Windows; Windows note links Mac | each note links the other two; the Linux note links the install steps |
| components/features.tsx:25 | "menu bar on Mac and the tray on Windows" | "menu bar on Mac and the tray on Windows and most Linux desktops" |
| components/features.tsx:51-57 | engine for Mac and Windows | adds the Linux engine |
| components/how-it-works.tsx:46-58 | Ctrl Alt D on Windows (os-win) | Ctrl Alt D on Windows (os-win) and Ctrl Alt K on Linux (os-linux), corrected 2026-10-15 |
| components/pricing.tsx:11 | "Mac and Windows, one licence" | "Mac, Windows and Linux, one licence" |
| components/pricing.tsx:43 | "trial · Mac and Windows" | "trial · Mac, Windows and Linux" |
| components/footer.tsx:50 | "for Mac and Windows" | "for Mac, Windows and Linux" |
| components/footer.tsx:54-69 | Mac and Windows downloads | adds Linux |
| components/faq.tsx:12 | Mac and Windows requirements, "One license covers both." | adds Linux, "One license covers all three." |
| components/faq.tsx:16 | metered examples for Mac and Windows | adds NetworkManager on Linux |
| components/faq.tsx:31-32 | "Is there a Windows version?" Mac and Windows | "Is there a Windows or Linux version?" all three; and a new "How do I install it on Linux?" |
| components/structured-data.tsx:44 | "macOS 14.0 or later, Windows 10, Windows 11" | adds "Debian 12 or later, Ubuntu 22.04 or later" |
| app/layout.tsx:63-67 | stamps Windows only | stamps Linux too, with its style |
| app/privacy/page.tsx:62-64 | costly connections on a Mac and in Windows | adds Linux |
| app/sitemap.ts:11-12 | home and privacy lastmod | at least LINUX_COPY_DATE |
| lib/compare.ts:35 | "macOS 14+ and Windows 10 & 11, one licence for both." | three platforms, "one licence for all three." |
| lib/compare.ts:75 | "on Mac and on Windows" | "on Mac, on Windows and on Linux" |
| lib/compare.ts:97 | "on your Mac or PC" | "on your own computer" |
| lib/compare.ts:150 | row "Windows version" | row "Windows and Linux versions" |
| lib/compare.ts:192 | row "Mac version" | row "Mac and Linux versions" |
| lib/compare.ts lastModified (each) | page dates | at least LINUX_COPY_DATE |
| lib/pages.ts:76-78 | "One purchase, both platforms", Mac and Windows | "One purchase, every platform", three |
| lib/pages.ts:147-149 | the same on /windows | the same, three |
| lib/pages.ts:179 | operatingSystem Mac and Windows | adds Linux |
| lib/pages.ts:182 | "Offline dictation software for Mac and Windows" | "for Mac, Windows and Linux" |
| lib/pages.ts:183 | "on your Mac or PC" | "on your own computer" |
| lib/pages.ts:192 and 205 | metered examples for Mac and Windows | adds NetworkManager on Linux |
| lib/pages.ts:209-211 | "Mac and Windows, one licence", "covers both platforms" | three platforms, "covers all three" |
| lib/pages.ts:222 | the same model on Mac and Windows since 1.7.0 | adds Linux from its first release, on the CPU |
| lib/pages.ts:226 | model hosts on Mac and on Windows | Windows and Linux share the Windows hosts |
| lib/pages.ts lastModified (each) | page dates | at least LINUX_COPY_DATE |

Left as they are, because they stay true with Linux added: Windows only copy (the SmartScreen
answer, Win+H, "on your PC" on the Windows pages); the network lists that name a version check,
which Linux does not make yet (they list what the app may do and claim nothing less); the privacy
page's description of update downloads, for the same reason.

## 5. What unit 10 changes

Adds `releases/1.14.0.json` as the publish tool writes it, which turns every Linux surface on; sets
`LINUX_COPY_DATE` (lib/site.ts) to the release date; changes `LINUX_UPDATES` (lib/pages.ts) only if
unit 5 shipped; removes the gate-off pin (it retires itself, so this is tidying); and keeps the
publish tool's GLIBC ceiling at or below the claimed floor (residual: the tool allows 2.39, the
claim needs 2.35).

## 6. Amendment 2026-10-13: the Linux feed's own checks (Koegaki unit 5)

Koegaki spec `2026-10-13-linux-updater` (rules 1 and 11) settles what rule 5 left to it. The guard
of rule 5 is replaced by the feed's own checks, in `tests/site.test.mjs`:

- **While no release record holds a deb, no Linux feed is served**, as before.
- **Once a real one does, `public/linux-updates.json` is served, and it is the only Linux feed.**
  No other file in `public/` may be a Linux feed, and no other feed may list a Linux platform.
  "Real" is the Linux release `releases/` offers (`linuxRelease`), judged the same way in the
  fixture run, whose synthetic release is never what `public/` serves.
- **`linuxUpdateProblems`, the twin of `windowsUpdateProblems`:** the Tauri static shape, holding
  exactly `version` (a bare SemVer core), `notes`, `pub_date` and `platforms` (the updater also
  reads top level `url`, `signature` and `name` and refuses a feed whose values it cannot read);
  exactly one
  platform, `linux-x86_64` (every x86_64 Linux build reads it after `linux-x86_64-deb`, which
  must not be there to shadow it); its `url` the record's deb url and its `signature` the
  record's deb signature, verifying over the record's BLAKE2b-512 with the Linux key and naming
  `com.vishutdhar.Koegaki_<version>_amd64.deb`. The feed's version is the Linux link's. When the
  Windows feed offers the same version, the two feeds' notes are the same text. The served feed is
  always held to the real record in `releases/` and the real Linux key, in the fixture run too,
  where the fixture's synthetic 1.14.0 record and key would otherwise shadow the real ones (review
  on the pull request).
- **While a Linux feed is served, the page's update sentence (`LINUX_UPDATES`) is exactly the
  approved one** (`LINUX_UPDATES_IN_APP` in the tests): "Koegaki for Linux checks for a new
  version when you open its window. Install and restart asks for your password, installs the new
  version and opens it. If it cannot, it shows the download and the one command to install it
  yourself. Your settings, history and downloaded models stay as they are."
- The checks are tried against the fixture's signed 1.14.0 record and the self tests' Linux only
  record, and each damaged case is refused.

What unit 10 writes, from the release record the publish tool wrote, in the same push as
`releases/<version>.json`:

```json
{
  "version": "<version>",
  "notes": "<the release notes, the same text as the Windows feed's when both ship>",
  "pub_date": "<RFC 3339 time of publication>",
  "platforms": {
    "linux-x86_64": {
      "url": "<artifacts.deb.url>",
      "signature": "<artifacts.deb.signature>"
    }
  }
}
```

and it sets `LINUX_UPDATES` to the approved sentence above.

## 7. Amendment 2026-10-16: turned on with Linux 1.14.0

The first Linux release, 1.14.0 (Koegaki `6acd2d49`), is one deb on the GitHub release `v1.14.0`,
published 2026-10-16T07:25:13Z. Its record turns every Linux surface of rules 9 to 13 on. The Mac
stays on 1.13.2 and Windows on 1.13.1: `appcast.xml`, `windows-updates.json`, their download links
and the Mac build map do not change.

- **The record.** `releases/1.14.0.json` is the publish tool's record, byte for byte: a deb alone,
  31328372 bytes, SHA-256 `03e27a6c1cd3c11ea6a7beb4f1da83274c30c5d8996db5b760442e501fce2428`, its
  BLAKE2b-512, and the updater signature, which names `com.vishutdhar.Koegaki_1.14.0_amd64.deb` and
  verifies with the base key (`EEB67ED3DCE4459A`). The Linux link is that deb's url, derived from the
  record (rules 4 and 7), so no link constant changes.
- **The feed.** `public/linux-updates.json`, written from the record as section 6 says: version
  1.14.0; notes, the five items of the app's Linux What's new list (`settings.html` at Koegaki
  `6acd2d49`) joined by single spaces, as the Windows feed's notes are; pub_date
  2026-10-16T07:25:13Z, the release's publication; and `platforms.linux-x86_64` holding the record's
  deb url and signature. The Linux build reads it from the endpoint of `tauri.linux.conf.json`.
- **LINUX_UPDATES** is the approved sentence of section 6, and **LINUX_COPY_DATE** is 2026-10-16.
- **Two answers on the Linux page follow the updater.** "Why does it ask for my password?" said only
  keyboard access asks; Install and restart asks too (Koegaki spec `2026-10-13-linux-updater` rule
  4), so the answer names both. "Does it need an internet connection?" listed what goes online
  without the version check and the update download, which 1.14.0 makes; it names both, as the Mac
  and Windows answers do, and states no cadence, which the Updates section gives. A test holds both
  answers while a Linux feed is served.
- **The cleanup download is listed.** The network answer said "a cleanup model downloads only when
  you choose it". Linux 1.14.0, like the Mac and Windows apps since 1.13.0, downloads the cleanup
  model by itself once the speech model is in place and waits on a metered connection (Koegaki
  `cleanup_service.rs`, `fetch_after_speech`), so the answer lists that download and says it waits,
  and a test holds it. The same stale sentence on the Mac, Windows and offline pages is outside this
  release, which leaves Mac and Windows copy as it is.
- **The pin of rule 8 moves to a gate off build instead of retiring.** Section 5 had this unit remove
  the pin once it retired itself. Instead `npm test` builds a third site
  (`tests/build-gate-off-fixture.mjs`) from `releases/` with every deb taken out
  (`tests/gate-off-releases.mjs`, written to `.next-gate-off-releases`), and runs every check of
  `tests/site.test.mjs` on it, named "gate off: ...". There the pin and the check that nothing in the
  build says Linux never skip, so the off side of every Linux gate stays the site before Linux to the
  byte, and taking the Linux records out would give that site back. The real and fixture runs skip
  both and say where they run. The config test holds the real config to the real records and the
  gate off config to today's two keys.
- **The floor.** The published deb's 18 ELF files need GLIBC 2.34 at most (measured on the deb), within
  the claimed floor of Ubuntu 22.04 (2.35) and Debian 12 (2.36). The publish tool's ceiling, the
  residual of section 5, is the Koegaki repository's and is not changed here.
