// Checks the BUILT site (the prerendered HTML and sitemap in .next), not the
// source, so what is pinned here is exactly what a crawler is served. Run with
// `npm test`, which builds first.
//
// One test needs the network and runs only when asked to. With RELEASE_FETCH=1
// it holds the live update manifest, appcast and download links to the
// offline checks, downloads from GitHub every asset the record of each release
// they serve from there states (both, or one for a release that shipped on one
// platform only), holds each to that record in releases/ (size, SHA-256 and
// BLAKE2b-512), and verifies the updater signature over each downloaded
// installer; then it downloads the installer the manifest and the
// Windows link serve, from whichever host, and holds it to its record, or to
// the installer public/downloads holds, and to the manifest's updater
// signature; then it downloads every disk image the appcast offers, from
// whichever host, and holds it to its enclosure's length and Sparkle
// signature, and to its record when one records its release. Without
// RELEASE_FETCH=1 it is reported as skipped, never as passed.
// Run it alone with
//
//   RELEASE_FETCH=1 node --import ./tests/register.mjs --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test --test-name-pattern="downloaded from GitHub" tests/site.test.mjs
//
// or with the whole suite as `RELEASE_FETCH=1 npm test`.
//
// `npm test` runs this file twice (docs/specs/2026-10-13-linux-site.md rule
// 15): on the real build in .next, and, from tests/linux-fixture.test.mjs, on
// the fixture build in .next-linux-fixture, which tests/build-linux-fixture.mjs
// makes from a 1.14.0 release holding a deb (tests/fixtures/linux-release),
// signed with a key made for the fixture. That run reads the fixture record
// beside the real ones, imports the site as that build saw it, and names each
// test "linux fixture: ...". Every page check runs on both builds, so the
// Linux copy meets every rule today's copy meets, before a real Linux release
// turns it on.
import { test as nodeTest } from "node:test";
import assert from "node:assert/strict";
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { SaxesParser } from "saxes";
import { LINUX_COPY_DATE, LINUX_RELEASE, SITE } from "../lib/site.ts";
import { LANDING_PAGES, LINUX_UPDATES } from "../lib/pages.ts";
import { COMPARISONS } from "../lib/compare.ts";
import { linuxRelease } from "../scripts/linux-release.mjs";

/** True in the run on the fixture build (see the top of this file). */
const LINUX_FIXTURE = process.env.KOEGAKI_SITE_BUILD === "linux-fixture";
const test = LINUX_FIXTURE ? (name, ...rest) => nodeTest(`linux fixture: ${name}`, ...rest) : nodeTest;
/** The release records the build read: releases/, or in the fixture run the fixture folder. */
const BUILD_RELEASES = new URL(LINUX_FIXTURE ? "fixtures/linux-release/" : "../releases/", import.meta.url);
/** Whether the build under test offers a Linux release, and so shows every Linux surface. */
const LINUX_ON = SITE.linuxDownloadUrl !== null;

const BUILD_ROOT = new URL(LINUX_FIXTURE ? "../.next-linux-fixture/" : "../.next/", import.meta.url);
const BUILT = new URL("server/app/", BUILD_ROOT);

function built(file) {
  const url = new URL(file, BUILT);
  assert.ok(existsSync(url), `missing build output ${file}; run npm test, which builds first`);
  return readFileSync(url, "utf8");
}

/** The prerendered HTML for a site path ("/" is the home page). */
function html(path) {
  return built(path === "/" ? "index.html" : `${path.slice(1)}.html`);
}

const ROUTES = [
  "/",
  ...LANDING_PAGES.map((p) => p.path),
  ...COMPARISONS.map((c) => `/vs/${c.slug}`),
  "/privacy",
];

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

/** Every <meta> or <link> in the document head whose `key` attribute equals `value`. */
function headTags(doc, key, value) {
  const head = doc.slice(0, doc.indexOf("</head>"));
  return (head.match(/<(?:meta|link)\s[^>]*>/g) ?? []).filter((t) => attr(t, key) === value);
}

function one(doc, key, value, read) {
  const tags = headTags(doc, key, value);
  assert.equal(tags.length, 1, `expected exactly one ${key}="${value}", found ${tags.length}`);
  return attr(tags[0], read);
}

const canonical = (doc) => one(doc, "rel", "canonical", "href");
const og = (doc, prop) => one(doc, "property", `og:${prop}`, "content");

function jsonLd(doc) {
  // Any attributes may sit beside the type, so an id or a nonce cannot hide a graph.
  return [...doc.matchAll(/<script\b[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}

function footer(doc) {
  const m = doc.match(/<footer[\s\S]*?<\/footer>/);
  assert.ok(m, "page has no footer");
  return m[0];
}

function anchors(fragment) {
  return [...fragment.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: m[1],
    text: m[2].replace(/<[^>]*>/g, "").replace(/<!-- -->/g, "").trim(),
  }));
}

test("the home page footer links every landing and comparison page with descriptive text", () => {
  const links = anchors(footer(html("/")));
  const wanted = [
    ...LANDING_PAGES.map((p) => [p.path, p.linkLabel]),
    ...COMPARISONS.map((c) => [`/vs/${c.slug}`, `${SITE.name} vs ${c.other}`]),
  ];
  for (const [path, text] of wanted) {
    const hit = links.find((l) => l.href === path);
    assert.ok(hit, `home footer does not link ${path}`);
    assert.equal(hit.text, text, `anchor text for ${path}`);
  }
  // The labels themselves must say what is behind the link.
  for (const p of LANDING_PAGES) {
    assert.match(p.linkLabel, /dictation/i, `link label for ${p.path} does not name the subject`);
  }
});

test("every page's canonical is absolute, is its own URL, and equals og:url", () => {
  for (const path of ROUTES) {
    const doc = html(path);
    const expected = path === "/" ? SITE.url : `${SITE.url}${path}`;
    assert.equal(canonical(doc), expected, `canonical of ${path}`);
    assert.equal(og(doc, "url"), canonical(doc), `og:url of ${path}`);
  }
});

test("the privacy page has its own canonical and its own Open Graph title and description", () => {
  const privacy = html("/privacy");
  const home = html("/");
  assert.equal(canonical(privacy), `${SITE.url}/privacy`);
  assert.notEqual(og(privacy, "title"), og(home, "title"));
  assert.notEqual(og(privacy, "description"), og(home, "description"));
  assert.equal(og(privacy, "description"), one(privacy, "name", "description", "content"));
});

test("every page carries og:site_name, og:locale en_US and the robots directives", () => {
  for (const path of ROUTES) {
    const doc = html(path);
    assert.equal(og(doc, "site_name"), SITE.name, `og:site_name of ${path}`);
    assert.equal(og(doc, "locale"), "en_US", `og:locale of ${path}`);
    assert.equal(
      one(doc, "name", "robots", "content"),
      "index, follow, max-image-preview:large, max-snippet:-1",
      `robots of ${path}`,
    );
  }
});

test("every page has one H1, a title of at most 63 characters and a description of at most 160", () => {
  for (const path of ROUTES) {
    const doc = html(path);
    assert.equal((doc.match(/<h1[\s>]/g) ?? []).length, 1, `H1 count of ${path}`);
    const title = doc.match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(title.length <= 63, `title of ${path} is ${title.length} chars: ${title}`);
    const description = one(doc, "name", "description", "content");
    assert.ok(description.length <= 160, `description of ${path} is ${description.length} chars`);
  }
});

test("the sitemap lists every page, each with a lastmod date", () => {
  const xml = built("sitemap.xml.body");
  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const locs = entries.map((e) => e.match(/<loc>([^<]*)<\/loc>/)[1]);
  const expected = ROUTES.map((p) => (p === "/" ? SITE.url : `${SITE.url}${p}`));
  assert.deepEqual([...locs].sort(), [...expected].sort());
  // Each page's date comes from its entry in the page data, not a shared default.
  const dated = [
    ...LANDING_PAGES.map((p) => [`${SITE.url}${p.path}`, p.lastModified]),
    ...COMPARISONS.map((c) => [`${SITE.url}/vs/${c.slug}`, c.lastModified]),
  ];
  for (const [loc, date] of dated) {
    const entry = entries.find((e) => e.includes(`<loc>${loc}</loc>`));
    assert.match(entry, new RegExp(`<lastmod>${date}</lastmod>`), `lastmod of ${loc}`);
  }
  for (const e of entries) {
    const lastmod = e.match(/<lastmod>([^<]*)<\/lastmod>/);
    assert.ok(lastmod, `no lastmod in ${e.trim()}`);
    assert.match(lastmod[1], /^\d{4}-\d{2}-\d{2}/);
    assert.ok(!Number.isNaN(Date.parse(lastmod[1])), `unparseable lastmod ${lastmod[1]}`);
    // A page cannot have changed after the build that serves it, nor before the site existed.
    assert.ok(Date.parse(lastmod[1]) <= Date.now(), `lastmod ${lastmod[1]} is in the future`);
    assert.ok(lastmod[1] >= "2026-06-25", `lastmod ${lastmod[1]} predates the site`);
  }
});

test("the platform landing pages describe the product with its one-time offer", () => {
  const home = jsonLd(html("/")).find((n) => n["@type"] === "SoftwareApplication");
  assert.ok(home, "home lost its SoftwareApplication");
  for (const page of LANDING_PAGES) {
    const nodes = jsonLd(html(page.path));
    const apps = nodes.filter((n) => n["@type"] === "SoftwareApplication");
    assert.equal(apps.length, 1, `SoftwareApplication count on ${page.path}`);
    const [app] = apps;
    assert.deepEqual(Object.keys(app), Object.keys(home), `shape of ${page.path} differs from home`);
    assert.equal(app["@context"], "https://schema.org");
    assert.equal(app.name, SITE.name);
    assert.equal(app.description, page.description, `description of ${page.path}`);
    assert.equal(app.url, `${SITE.url}${page.path}`, `url of ${page.path}`);
    assert.equal(app.image, home.image);
    assert.equal(app.applicationCategory, home.applicationCategory);
    assert.equal(app.operatingSystem, page.operatingSystem);
    assert.deepEqual(app.offers, home.offers);
    assert.deepEqual(app.offers, {
      "@type": "Offer",
      price: String(SITE.priceUSD),
      priceCurrency: "USD",
      url: `${SITE.url}/buy`,
    });
    assert.equal(app.offers.price, "30");
    assert.equal(nodes.filter((n) => n["@type"] === "FAQPage").length, 1, `FAQPage count on ${page.path}`);
    assert.equal(nodes.filter((n) => n["@type"] === "BreadcrumbList").length, 1, `breadcrumb count on ${page.path}`);
  }
});

/**
 * The @id values a set of JSON-LD graphs references but never defines. A node
 * that carries only "@id" is a reference; a node with any other property
 * defines that id.
 */
function danglingIds(graphs) {
  const defined = new Set();
  const referenced = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    if (typeof v["@id"] === "string") {
      (Object.keys(v).length === 1 ? referenced : defined).add(v["@id"]);
    }
    Object.values(v).forEach(walk);
  };
  walk(graphs);
  return [...referenced].filter((id) => !defined.has(id));
}

test("the dangling @id check catches a reference with no definition", () => {
  assert.deepEqual(danglingIds([{ "@type": "WebPage", publisher: { "@id": "#org" } }]), ["#org"]);
  assert.deepEqual(danglingIds([{ "@id": "#org", "@type": "Organization" }, { publisher: { "@id": "#org" } }]), []);
});

test("all JSON-LD parses and every @id reference resolves on the same page", () => {
  for (const path of ROUTES) {
    assert.deepEqual(danglingIds(jsonLd(html(path))), [], `${path} references undefined @id`);
  }
});

test("the home H1 does not run the platform words together in extracted text", () => {
  const h1 = html("/").match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  const text = h1.replace(/<br[^>]*>/g, " ").replace(/<[^>]*>/g, "");
  assert.doesNotMatch(text, /MacPC/);
  assert.match(text, /Mac\s+PC/);
});

test("the H1 separator stays invisible: one platform word shows and its space collapses", () => {
  const doc = html("/");
  const h1 = doc.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  // The separator lives inside the PC word, directly after the space before
  // the Mac word, so whichever word is shown gets exactly one space. With a
  // Linux release the PC word shows on Windows and on Linux (os-pc), and the
  // layout's inline style hides it on the Mac (the platform stamp test pins
  // those rules); without one it is today's Windows word.
  const pc = LINUX_ON ? "os-pc" : "os-win";
  assert.match(h1, new RegExp(`on your <span class="os-mac">Mac</span><span class="${pc}"> PC</span>\\.`));
  // ...which only holds while the stylesheet removes the other word entirely.
  const css = [...doc.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)]
    .map((m) => readFileSync(new URL(m[1].slice("/_next/".length), BUILD_ROOT), "utf8"))
    .join("");
  assert.match(css, /html:not\(\[data-os=win\]\) \.os-win[,{][^}]*display:none/);
  assert.match(css, /\[data-os=win\] \.os-mac[,{][^}]*display:none/);
  // No other rule may style the two words (a later display value would bring
  // the hidden one back), and nothing on the H1 may preserve whitespace.
  const rules = css.match(/[^{}]*\.os-(?:mac|win)\b[^{}]*\{[^}]*\}/g) ?? [];
  assert.deepEqual(rules, ["html:not([data-os=win]) .os-win,[data-os=win] .os-mac{display:none}"]);
  assert.doesNotMatch(doc.match(/<h1[^>]*>/)[0], /whitespace-pre|break-spaces/);
});

test("no page tells a visitor that a model can come from Hugging Face", () => {
  // Every shipped build fetches its models from the Koegaki model mirror or
  // the pinned upstream release it names; none falls back to Hugging Face, so
  // the site may not say one does.
  for (const path of ROUTES) {
    const sentence = html(path).match(/[^.>]*hugging\s*face[^.<]*/i)?.[0];
    assert.equal(sentence, undefined, `${path} names Hugging Face`);
  }
});

/** A page's visible text: no scripts or styles, tags as spaces, the common entities decoded. */
function pageText(doc) {
  return doc
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

test("the Mac, Windows and home pages answer whether you can add your own words", () => {
  // Custom words ship on both platforms (Koegaki spec 2026-10-04), so every page
  // that sells a platform answers the question, in the visible FAQ and in the
  // FAQPage data built from the same list, and says where the list lives.
  const question = "Can I add my own words?";
  for (const path of ["/", "/mac", "/windows"]) {
    const doc = html(path);
    const faq = jsonLd(doc).find((n) => n["@type"] === "FAQPage");
    assert.ok(faq, `${path} has no FAQPage`);
    const entry = faq.mainEntity.find((e) => e.name === question);
    assert.ok(entry, `${path} does not answer "${question}"`);
    assert.match(entry.acceptedAnswer.text, /^Yes\. /, `${path} answer does not say yes`);
    assert.match(entry.acceptedAnswer.text, /\bCustom words\b/, `${path} answer does not name Custom words`);
    assert.match(entry.acceptedAnswer.text, /\bVocabulary page\b/, `${path} answer does not say where the list is`);
    assert.ok(pageText(doc).includes(question), `${path} does not show "${question}"`);
    assert.ok(pageText(doc).includes(entry.acceptedAnswer.text), `${path} does not show the answer it gives crawlers`);
  }
});

/**
 * The transcript examples the site may quote about custom words, each mirrored
 * from a case in the table the Mac and Windows rules both run (Koegaki
 * docs/vocabulary/canonical-spelling-cases.json at afd62e12; the case id is
 * beside each): what the recognizer wrote, and what Koegaki writes with the
 * term saved. An example the copy needs that is missing here is added from
 * that table, never from memory.
 */
const VERIFIED_EXAMPLES = new Map([
  ["post hog", "PostHog"], // join-space, term PostHog
  ["habit-flame", "HabitFlame"], // join-hyphen, term HabitFlame
  ["o brien", "O'Brien"], // join-apostrophe-in-term, term O'Brien
  ["private scan", "PrivateScan"], // homophone-two-real-words, term PrivateScan
  ["github", "GitHub"], // case-only-mixed-case-fires, term GitHub
  ["freedom terminal", "Freedom Terminal"], // case-only-multiword-fires, term Freedom Terminal
  ["tell us now", "tell us now"], // case-only-allcaps-blocked, term US
  ["a swift reply", "a swift reply"], // case-only-initialcap-blocked, term Swift
  ["a w s", "AWS"], // allcaps-join-fires, term AWS
  ["X code", "Xcode"], // initialcap-join-fires, term Xcode
  ["x code", "x code"], // lowercase-single-letter-does-not-join, term Xcode
  ["i phone", "i phone"], // lowercase-single-letter-before-word-blocked, term iPhone
  ["I pad", "iPad"], // uppercase-single-letter-joins, term iPad
  ["vitamin d", "Vitamin D"], // single-letter-at-stored-space-joins, term Vitamin D
]);

/**
 * Every transcript example in a block, checked against VERIFIED_EXAMPLES:
 * "“heard” becomes Written", "“heard” is written Written", "turns “heard” into
 * Written", and "“heard” stays" (or "is left") for text the rule does not
 * touch. A quoted saved term ("“PostHog” as a custom word") is not an example.
 * A quote in any other shape, or a "becomes", "turns into" or "is written
 * Spelling" outside a quoted example, cannot be checked, so it is a problem
 * too: the check fails closed.
 */
function exampleProblems(block) {
  const end = String.raw`(?=[,.;:]|\s+(?:and|while|so|though|but)\s|$)`;
  const savedTerm = /[“"]([^”"]+)[”"]\s+as\s+a\s+custom\s+word\b/dg;
  const shapes = [
    new RegExp(String.raw`[“"]([^”"]+)[”"]\s+(?:becomes|is written|turns into)\s+([^,.;:]+?)${end}`, "dg"),
    new RegExp(String.raw`\bturns?\s+[“"]([^”"]+)[”"]\s+into\s+([^,.;:]+?)${end}`, "dg"),
    /[“"]([^”"]+)[”"],?\s+(?:usually\s+)?(?:stays|is left)\b/dg,
  ];
  const problems = [];
  const read = new Set();
  const verbs = new Set();
  for (const m of block.matchAll(savedTerm)) read.add(m.indices[1][0]);
  for (const shape of shapes) {
    for (const m of block.matchAll(shape)) {
      const [heard, written = heard] = [m[1], m[2]];
      read.add(m.indices[1][0]);
      const verb = m[0].search(/\b(?:becomes|turns? into|is written|into)\b/);
      if (verb >= 0) verbs.add(m.index + verb);
      if (VERIFIED_EXAMPLES.get(heard) !== written) {
        problems.push(`quotes an example the app does not produce: “${heard}” written as ${written}`);
      }
    }
  }
  for (const m of block.matchAll(/[“"]([^”"]+)[”"]/dg)) {
    if (!read.has(m.indices[1][0])) problems.push(`quotes an example the check cannot verify: “${m[1]}”`);
  }
  for (const m of block.matchAll(/\b(?:becomes|turns into)\b|\bis written(?= \p{Lu})/gu)) {
    if (!verbs.has(m.index)) problems.push(`gives an unquoted example the check cannot verify: "${m[0]}"`);
  }
  return problems;
}

/**
 * Sentences in a passage about custom words that use a word the check refuses
 * but were reviewed against the app (Koegaki spec 2026-10-04 and the code at
 * afd62e12; for Windows, spec 2026-10-06-windows-hotwords and the 1.10.0
 * release, 4adbf089; for the Mac, spec 2026-10-08-mac-decode-time-biasing and
 * the 1.12.0 release, d3564eb1 and c9f015fb) and say nothing it does not do,
 * each with the reason. The check fails closed: an honest sentence that trips
 * it is reviewed and added here; there is no other way past it. The route test
 * drops an entry the site no longer says.
 */
const REVIEWED_SENTENCES = new Map([
  [
    "And the model is always on your Mac, for every language it supports, with nothing falling back to a server.",
    "about the speech model, which does run on the Mac for every language it supports, not about custom words",
  ],
  [
    "With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your PC.",
    "Windows only (the /windows page and /vs/windows-voice-typing): since 1.10.0 the custom words list is passed to the English model, the default, as hotwords for its beam search, so those words are recognised more often (spec 2026-10-06 items 1 and 2), while the Multilingual model is not biased; the list stays on the PC; the app's What's new says the same (spec item 6, 4adbf089)",
  ],
  [
    "With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your Mac.",
    "the Mac only (the /mac page): since 1.12.0 the English model, Parakeet Ultra and the default, decodes with a bias toward the custom words list, so those words are recognised more often (spec 2026-10-08-mac-decode-time-biasing items 2 and 3, What users notice item 1), while the Multilingual model decodes as before (item 3); nothing is downloaded and the list stays on the Mac (item 4); the app's What's new says the same (c9f015fb)",
  ],
  [
    "With the English speech model, the default, custom words also help Koegaki hear your names and terms, not just spell them: words on your list are recognised more often, and they still never leave your computer.",
    "both platforms (the home page FAQ, and the shared custom vocabulary row on /vs/wispr-flow and /vs/macos-dictation): the English model, the default on both, is biased toward the list on Windows since 1.10.0 (spec 2026-10-06 items 1 and 2) and on the Mac since 1.12.0 (spec 2026-10-08-mac-decode-time-biasing items 2 and 3); the Multilingual model is not biased on either; the list stays on the computer (spec 2026-10-06, and 2026-10-08 item 4)",
  ],
]);

/** A block's sentences, split where a sentence ends. */
const sentencesOf = (block) => block.split(/(?<=[.!?])\s+/);

/**
 * What a page says about custom words that the app does not do (Koegaki spec
 * 2026-10-04). A custom word changes how a run of words the recognizer already
 * heard is written (item 2). With the English model the list also biases
 * recognition toward its words, on Windows since 1.10.0 (spec 2026-10-06) and
 * on the Mac since 1.12.0 (spec 2026-10-08-mac-decode-time-biasing), which
 * amend item 2; the Multilingual model is biased on neither. So no sentence
 * about custom words may use the words of learning, training, teaching,
 * biasing, recognition, understanding, accuracy, unknown words or
 * misspellings, in any form of those words, unless it is reviewed against
 * those limits and listed in REVIEWED_SENTENCES. They ship on both platforms, so
 * none may call them missing; they apply only to Latin, Greek and Cyrillic
 * terms (item 4), so none may promise every language or script; and every
 * example it quotes must be one the app's case table proves.
 *
 * Every sentence of a passage about custom words is judged, with no guess at
 * negation or at what the sentence is about: those guesses let overclaims
 * through or refused honest limits, one way or the other, in every version
 * that tried them. An honest sentence the check refuses is reviewed and
 * listed in REVIEWED_SENTENCES instead.
 */
function customWordsProblems(doc, reviewed = REVIEWED_SENTENCES) {
  // Stems, with the irregular forms spelled out: taught, understood, misspelt.
  const recognitionClaim = /\b(?:learn|train|teach|taught|bias|recogni|accura|understand|understood|unknown|misspel)/i;
  const absenceClaim =
    /\b(?:unavailable|not available|unsupported|not supported|no longer|removed|coming soon|not yet|only on)\b/i;
  // "every language", and with a qualifier between: "all supported languages".
  const everyScript = /\b(?:every|any|all)\s+(?:\S+\s+){0,2}?(?:languages?|scripts?|alphabets?|writing systems?)\b/i;
  return customWordsMentions(doc).flatMap((block) =>
    sentencesOf(block)
      .filter((sentence) => !reviewed.has(sentence))
      .flatMap((sentence) => [
        ...(recognitionClaim.test(sentence) ? [`describes custom words as recognition: "${sentence}"`] : []),
        ...(absenceClaim.test(sentence) ? [`describes custom words as absent: "${sentence}"`] : []),
        ...(everyScript.test(sentence)
          ? [`promises custom words in every script, past the Latin, Greek and Cyrillic limit: "${sentence}"`]
          : []),
        ...exampleProblems(sentence).map((problem) => `${problem}, in "${sentence}"`),
      ]),
  );
}

/** Decode the entities React and the meta tags write. */
function decodeEntities(text) {
  return text
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Every block of text on a page a visitor or a crawler reads, in order: each
 * paragraph, list item, table cell, heading and FAQ summary of the body (a
 * heading or summary is marked, and so is a table cell), then the page's
 * description meta tags and every string in its JSON-LD, which stand alone.
 */
function textBlocks(doc) {
  const body = doc.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ");
  const parts = body.split(
    /(<\/?(?:p|li|td|th|h[1-6]|summary|details|div|section|article|header|footer|main|nav|ul|ol|table|tr|thead|tbody|dl|dt|dd|title)\b[^>]*>)/i,
  );
  const blocks = [];
  let inHeading = false;
  let inCell = false;
  // split() with a capturing group alternates text (even index) and the
  // block tag that ended it (odd index). Telling them apart by position keeps
  // a text piece that itself opens with an inline tag such as <strong>.
  // A table cell is one block however many paragraphs it holds, since the
  // next cell may be another product's.
  let cellText = [];
  const endCell = () => {
    if (cellText.length) blocks.push({ text: cellText.join(" "), heading: false, cell: true });
    cellText = [];
  };
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      if (/^<(?:h[1-6]|summary)\b/i.test(part)) inHeading = true;
      else if (/^<\/(?:h[1-6]|summary)\b/i.test(part)) inHeading = false;
      else if (/^<t[dh]\b/i.test(part)) {
        endCell();
        inCell = true;
      } else if (/^<\/t[dh]\b/i.test(part)) {
        endCell();
        inCell = false;
      }
      return;
    }
    const text = decodeEntities(part.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!text) return;
    if (inCell) cellText.push(text);
    else blocks.push({ text, heading: inHeading, cell: false });
  });
  endCell();
  const standalone = [];
  for (const [key, value] of [
    ["name", "description"],
    ["property", "og:description"],
    ["name", "twitter:description"],
  ]) {
    for (const tag of headTags(doc, key, value)) standalone.push(decodeEntities(attr(tag, "content") ?? ""));
  }
  const walk = (v) => {
    if (typeof v === "string") standalone.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(jsonLd(doc));
  return { body: blocks, standalone: standalone.filter(Boolean) };
}

/**
 * Every block of a page about custom words: one that names them, every block
 * after it up to the next heading or FAQ question, and every block under a
 * heading or FAQ question that names them, up to the next one. A table cell
 * stands alone, since the next cell may be another product's. A claim is
 * judged with the rest of its block, so a sentence cannot escape the check by
 * following the one that names the feature, by sitting in a later paragraph
 * of its section, or by sitting under a heading that names it.
 */
function customWordsMentions(doc) {
  const names = (text) => /\bcustom words?\b/i.test(text);
  const { body, standalone } = textBlocks(doc);
  const mentions = [];
  let underHeading = false;
  let afterMention = false;
  for (const { text, heading, cell } of body) {
    if (heading) {
      underHeading = names(text);
      afterMention = false;
    }
    if (cell) {
      if (names(text)) mentions.push(text);
      continue;
    }
    if (underHeading || afterMention || names(text)) mentions.push(text);
    if (names(text)) afterMention = true;
  }
  return [...mentions, ...standalone.filter(names)];
}

test("the custom words check catches an overclaim or an absence wherever a page says it", () => {
  const page = (body, head = "") => `<html><head>${head}</head><body>${body}</body></html>`;
  const ld = (text) =>
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text } }],
    })}</script>`;
  const caught = [
    // The claim in the sentence after the one that names custom words.
    ["a claim in the next sentence", page("<p>Custom words. It learns unknown names.</p>"), /recognition/],
    ["a promise to fix any misspelling", page("<p>Custom words fix every misspelling.</p>"), /recognition/],
    ["custom words described as absent", page("<p>Custom words are unavailable on the Vocabulary page.</p>"), /absent/],
    ["a claim in the meta description", page("<p>Hi.</p>", '<meta name="description" content="Custom words Koegaki learns."/>'), /recognition/],
    ["a claim in the Open Graph description", page("<p>Hi.</p>", '<meta property="og:description" content="Custom words improve accuracy."/>'), /recognition/],
    ["a claim in the FAQPage data", page(`<p>Hi.</p>${ld("Custom words are trained into the model.")}`), /recognition/],
    ["a platform described as missing it", page("<p>Custom words are not supported on Windows.</p>"), /absent/],
    ["a claim under a heading that names it", page("<h3>Custom words</h3><p>Koegaki learns your product names as you dictate.</p>"), /recognition/],
    ["an example the app does not produce", page("<p>Custom words turn “x code” into Xcode.</p>"), /example/],
    ["an example the case table does not prove", page("<p>Custom words fix “pozt hog” as well.</p>"), /example/],
    [
      "a claim in a later paragraph of its section",
      page("<h2>Your words</h2><p>Custom words, spelled your way.</p><p>Koegaki learns your product names as you dictate.</p>"),
      /recognition/,
    ],
    ["a promise of every language", page("<p>Custom words work in every language.</p>"), /script/],
    ["an unquoted example", page("<p>Add Xcode as a custom word and x code becomes Xcode.</p>"), /unquoted/],
    ["an unquoted example with is written", page("<p>Add Xcode as a custom word and x code is written Xcode.</p>"), /unquoted/],
    ["a model claim in the next sentence", page("<p>Custom words, spelled your way. Over time the model learns them.</p>"), /recognition/],
    [
      "a promise of every language beside the model",
      page("<p>Add your names and jargon as custom words. They work in every language the speech model supports.</p>"),
      /script/,
    ],
    [
      "a promise of every language beside replacements",
      page("<p>Add your names and jargon as custom words. Like replacements, they work in every language.</p>"),
      /script/,
    ],
    [
      "a claim after a negated clause",
      page("<p>No training needed: Koegaki learns your custom words instantly.</p>"),
      /recognition/,
    ],
    [
      "a promise of every language in the next sentence",
      page("<p>Add your names and jargon as custom words. They work in every language.</p>"),
      /script/,
    ],
    ["recognition as a noun", page("<p>Custom words improve recognition.</p>"), /recognition/],
    ["a promise of every supported language", page("<p>Custom words work in all supported languages.</p>"), /script/],
    [
      "a claim in a paragraph that opens with inline formatting",
      page("<h3>Custom words</h3><p><strong>Improve accuracy</strong> for names and jargon.</p>"),
      /recognition/,
    ],
    ["an irregular form of misspell", page("<p>Custom words fix misspelt names.</p>"), /recognition/],
    ["an irregular form of understand", page("<p>Custom words ensure your jargon is understood.</p>"), /recognition/],
    [
      "an irregular form of teach",
      page("<p>Once you’ve taught Koegaki your custom words, it gets them right every time.</p>"),
      /recognition/,
    ],
    [
      "a claim in a later paragraph of the same table cell",
      page("<table><tr><td><p>Custom words, spelled your way.</p><p>Improves recognition of names and jargon.</p></td></tr></table>"),
      /recognition/,
    ],
    [
      "a claim in JSON-LD whose script tag carries another attribute",
      page(`<p>Hi.</p>${ld("Custom words improve recognition.").replace("<script ", '<script id="vocabulary-faq" ')}`),
      /recognition/,
    ],
    [
      "a promise behind an unrelated negation",
      page("<p>Custom words never leave your device and work in every language.</p>"),
      /script/,
    ],
  ];
  for (const [what, doc, message] of caught) {
    const problems = customWordsProblems(doc);
    assert.equal(problems.length, 1, `${what}: ${JSON.stringify(problems)}`);
    assert.match(problems[0], message, what);
  }
  const honest = [
    page("<p>With the Multilingual model, custom words change how a word is written, not what is heard.</p>"),
    // The other product's cell is its own block, so its wording is its own.
    page("<table><tr><td>Custom words, spelled your way.</td><td>Dictionary of terms it learns to recognise.</td></tr></table>"),
    page("<p>Custom words: “post hog” becomes PostHog, “X code” becomes Xcode and “tell us now” stays as it is.</p>"),
    page("<p>Custom words leave a lone letter, as in “x code”, usually stays a word of its own.</p>"),
    // A heading's context ends at the next heading.
    page("<h3>Custom words</h3><p>Spelled your way.</p><h3>Accuracy</h3><p>The model recognises speech well.</p>"),
    // A paragraph before the one that names custom words is not about them.
    page("<h2>Changes</h2><p>The model recognises speech.</p><p>Custom words, spelled your way.</p>"),
    // A quoted saved term is not a transcript example.
    page("<p>Add “PostHog” as a custom word and “post hog” becomes PostHog.</p>"),
    // Each table cell stands alone, so the other product's cells are its own.
    page(
      "<h2>Compare</h2><table><tr><th>Custom vocabulary</th><td>Custom words, spelled your way.</td><td>Dictionary of terms it learns to recognise.</td></tr><tr><th>Where</th><td>Audio is uploaded for recognition.</td></tr></table>",
    ),
  ];
  for (const doc of honest) assert.deepEqual(customWordsProblems(doc), [], doc);
  assert.ok(customWordsMentions(page("<p>Custom words, spelled your way.</p>")).length > 0);
});

test("the custom words check fails closed: an honest sentence it refuses passes only once reviewed", () => {
  // Honest limits a copywriter might write that use a refused word. The check
  // does not guess at negation or a sentence's subject, which every earlier
  // attempt got wrong one way or the other; each such sentence is reviewed
  // against the app and listed in REVIEWED_SENTENCES before it can ship.
  const page = (body) => `<html><head></head><body>${body}</body></html>`;
  const limits = [
    "Custom words in Japanese are not supported.",
    "They don’t work in every language: terms need Latin, Greek or Cyrillic letters.",
    "Custom words never change what the Multilingual model recognises.",
    "Custom words need no training.",
    "Use a replacement for a name Koegaki keeps misspelling.",
    "Add a replacement for a name Koegaki keeps misspelling.",
    "With a replacement, a short word becomes your full email address.",
    "The model runs on your Mac, for every language it supports.",
  ];
  for (const sentence of limits) {
    const doc = page(`<p>Custom words, spelled your way.</p><p>${sentence}</p>`);
    assert.notDeepEqual(customWordsProblems(doc), [], `passed without review: ${sentence}`);
    assert.deepEqual(customWordsProblems(doc, new Map([[sentence, "reviewed in this probe"]])), [], sentence);
  }
});

test("custom words are described as a spelling rule, never as recognition or as absent", () => {
  let described = 0;
  const onSite = new Set();
  for (const path of ROUTES) {
    const doc = html(path);
    for (const block of customWordsMentions(doc)) {
      described++;
      for (const sentence of sentencesOf(block)) onSite.add(sentence);
    }
    assert.deepEqual(customWordsProblems(doc), [], `${path} misdescribes custom words`);
  }
  assert.ok(described > 0, "no page describes custom words");
  // A reviewed sentence the site no longer says is dropped from the list, so
  // the list only ever names copy someone checked.
  for (const sentence of REVIEWED_SENTENCES.keys()) {
    assert.ok(onSite.has(sentence), `REVIEWED_SENTENCES lists a sentence the site no longer says: "${sentence}"`);
  }
});

test("each platform's engine copy names the English model the model index serves", () => {
  // The display name for each English speech identity the index can list. An
  // identity missing here is a new model: add its name and update the copy.
  const NAMES = {
    "parakeet-ultra": "Parakeet Ultra",
    "sherpa-onnx-nemo-parakeet-ultra-int8": "Parakeet Ultra",
  };
  const index = JSON.parse(readFileSync(new URL("../public/models.json", import.meta.url), "utf8"));
  const engines = { mac: SITE.engine, windows: SITE.windowsEngine, ...(LINUX_ON ? { linux: SITE.linuxEngine } : {}) };
  for (const [platform, engine] of Object.entries(engines)) {
    const identity = index[platform]["speech-english"].identity;
    const name = NAMES[identity];
    assert.ok(name, `no display name for the ${platform} English identity ${identity}`);
    assert.ok(engine.startsWith(`${name} · `), `${platform} engine "${engine}" does not name ${name}`);
  }
});

test("a page that promises a one-time model download also says how a new speech model arrives", () => {
  // Each model downloads once, but an app update that brings a new speech model
  // downloads it in the background on both platforms, so "downloads once" alone
  // is not the whole truth.
  for (const path of ROUTES) {
    const text = html(path).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    if (!/downloads? once|downloaded once|one-time model download/i.test(text)) continue;
    assert.match(text, /app update brings a new speech model/i, `${path} says a model downloads once and stops there`);
  }
});

/**
 * The wait for an unmetered connection (Koegaki spec
 * 2026-10-05-metered-connection-deferral, 1.9.0 on both platforms). The speech
 * model an app update brings, and a cleanup model the app fetches at launch,
 * wait while the computer is on a connection it treats as costly; a download
 * the user starts, the first download after an install, a repair of a damaged
 * file and the app update go ahead on any connection. Apple documents its
 * expensive path as cellular or a Personal Hotspot and Low Data Mode as its
 * constrained one; Microsoft documents cellular as metered by default and Wi-Fi
 * as unmetered until the user marks it. Each sentence the site says about it,
 * with the pages it was reviewed for and why it is true.
 */
const MAC_WAIT =
  "That background download waits while your Mac is on a connection it treats as costly, such as an iPhone's Personal Hotspot or a network with Low Data Mode turned on.";
const WINDOWS_WAIT =
  "That background download waits while your PC is on a connection Windows treats as metered, such as a cellular link or a network you have set as metered, which you can do for a phone hotspot.";
const BOTH_WAIT =
  "That background download waits while your computer is on a connection it treats as costly, such as an iPhone's Personal Hotspot on a Mac or a network you have set as metered in Windows.";
const PRIVACY_WAIT =
  "That download, and the download of a cleanup model you turned on when the app has to fetch it at launch, waits while your computer is on a connection it treats as costly, and starts by itself once you are back on an ordinary connection.";
/**
 * The same wait on Linux (Koegaki spec 2026-10-12-linux-platform-gaps rules 6
 * and 7): NetworkManager's Metered property, yes or guess yes, is costly, and
 * the automatic downloads wait behind the gate Windows uses; a user sets a
 * connection as metered in NetworkManager. With no NetworkManager the download
 * goes ahead, which "treats as metered" leaves true. Said only once a Linux
 * release exists, as are the three platform forms below.
 */
const LINUX_WAIT =
  "That background download waits while your computer is on a connection NetworkManager treats as metered, which you can set for a phone hotspot.";
const THREE_WAIT =
  "That background download waits while your computer is on a connection it treats as costly, such as an iPhone's Personal Hotspot on a Mac, a network you have set as metered in Windows, or one NetworkManager treats as metered on Linux.";
/** Pages a sentence is said on in this build: `today` without a Linux release, `withLinux` with one. */
const onPages = (today, withLinux) => (LINUX_ON ? withLinux : today);
const REVIEWED_WAIT_SENTENCES = new Map([
  [MAC_WAIT, { where: ["/mac"], why: "the Mac waits on an expensive path (Personal Hotspot) or a constrained one (Low Data Mode)" }],
  [WINDOWS_WAIT, { where: ["/windows"], why: "Windows waits on the cost it reports; Wi-Fi counts only once marked metered" }],
  [BOTH_WAIT, { where: onPages(["/", "/offline-dictation"], []), why: "the same rule for both platforms, each example under its own OS" }],
  [THREE_WAIT, { where: onPages([], ["/", "/offline-dictation"]), why: "the same rule on all three platforms, each example under its own OS" }],
  [LINUX_WAIT, { where: onPages([], ["/linux"]), why: "Linux waits on NetworkManager's metered verdict, which the user can set" }],
  [PRIVACY_WAIT, { where: ["/privacy"], why: "names the two downloads that wait, not every download the app starts" }],
  [
    "Costly connections include an iPhone's Personal Hotspot and Low Data Mode on a Mac, and in Windows a cellular link and any network you marked as metered, which you can do for a phone hotspot.",
    { where: onPages(["/privacy"], []), why: "each OS's own signal" },
  ],
  [
    "Costly connections include an iPhone's Personal Hotspot and Low Data Mode on a Mac, in Windows a cellular link and any network you marked as metered, which you can do for a phone hotspot, and on Linux any connection NetworkManager treats as metered.",
    { where: onPages([], ["/privacy"]), why: "each OS's own signal, Linux's being NetworkManager's metered verdict" },
  ],
  [
    "A download you start yourself, and the first download after you install, go ahead on any connection.",
    { where: ["/privacy"], why: "a download the user starts and the first install have no gate on either platform" },
  ],
]);
/** The sentences that state the wait itself. */
const WAIT_CLAIMS = [MAC_WAIT, WINDOWS_WAIT, BOTH_WAIT, THREE_WAIT, LINUX_WAIT, PRIVACY_WAIT];

/**
 * A page's text in runs: paragraphs run on into one another until a heading or
 * a table cell, so a wait said in the next paragraph of a section still counts.
 * Each string that stands alone (meta tags, JSON-LD) is its own run.
 */
function runsOf(doc) {
  const { body, standalone } = textBlocks(doc);
  const runs = [];
  let open = null;
  for (const { text, heading, cell } of body) {
    if (heading || cell || !open) {
      open = { part: "body", texts: [] };
      runs.push(open);
    }
    open.texts.push(text);
    if (heading || cell) open = null;
  }
  for (const text of standalone) runs.push({ part: "standalone", texts: [text] });
  return runs;
}

test("every page that describes the background model download says when it waits, in its text and its JSON-LD", () => {
  const described = new Set();
  for (const path of ROUTES) {
    for (const { part, texts } of runsOf(html(path))) {
      const describing = texts.find((t) => /\bbackground\b/i.test(t) && /\bdownloads?\b/i.test(t));
      if (!describing) continue;
      described.add(`${path} ${part}`);
      const sentences = texts.flatMap(sentencesOf);
      assert.ok(
        WAIT_CLAIMS.some((claim) => sentences.includes(claim)),
        `${path} describes the background download without its wait: "${describing}"`,
      );
    }
  }
  // Where it is described today: the privacy page, and the home and landing
  // page prose and network FAQs, each FAQ in its JSON-LD (standalone) too, so
  // the visible answer and the structured data cannot disagree.
  assert.deepEqual([...described].sort(), [
    "/ body",
    "/ standalone",
    ...(LINUX_ON ? ["/linux body", "/linux standalone"] : []),
    "/mac body",
    "/mac standalone",
    "/offline-dictation body",
    "/privacy body",
    "/windows body",
    "/windows standalone",
  ]);
});

test("every sentence that names a costly connection is a reviewed one, on exactly the pages it was reviewed for", () => {
  // The feature's own terms. A new sentence that uses them is reviewed into
  // REVIEWED_WAIT_SENTENCES before it ships.
  const namesCost = /\b(?:costly|metered|low data mode|hotspots?)\b/i;
  const pagesOf = new Map([...REVIEWED_WAIT_SENTENCES.keys()].map((sentence) => [sentence, []]));
  for (const path of ROUTES) {
    const sentences = new Set(runsOf(html(path)).flatMap(({ texts }) => texts.flatMap(sentencesOf)));
    for (const sentence of sentences) {
      assert.ok(
        !namesCost.test(sentence) || REVIEWED_WAIT_SENTENCES.has(sentence),
        `${path} says something unreviewed about a costly connection: "${sentence}"`,
      );
      pagesOf.get(sentence)?.push(path);
    }
  }
  for (const [sentence, { where }] of REVIEWED_WAIT_SENTENCES) {
    assert.deepEqual(pagesOf.get(sentence).sort(), [...where].sort(), `pages that say "${sentence}"`);
  }
});

test("no page promises a change for an app version the site already serves", () => {
  // Copy written ahead of a release ("the Windows app gains this in version
  // 1.7.0") is a promise, and it turns false the day that version ships. Each
  // platform serves the version its download link names; a sentence that
  // promises something for a version at or below that one is stale.
  const served = {
    mac: SITE.downloadUrl.match(/\/Koegaki-(\d+(?:\.\d+)*)\.dmg$/)?.[1],
    windows: SITE.windowsDownloadUrl.match(/\/Koegaki-(\d+(?:\.\d+)*)-setup\.exe$/)?.[1],
    ...(LINUX_ON ? { linux: SITE.linuxDownloadUrl.match(/\/Koegaki-(\d+(?:\.\d+)*)-amd64\.deb$/)?.[1] } : {}),
  };
  assert.ok(Object.values(served).every(Boolean), `no served version in the download links ${JSON.stringify(served)}`);
  const parts = (v) => v.split(".").map(Number);
  const atOrBelow = (v, ceiling) => {
    const [a, b] = [parts(v), parts(ceiling)];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    }
    return true;
  };
  for (const path of ROUTES) {
    const text = html(path)
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      if (!/\b(?:gains?|will|moves? to|coming|until)\b/i.test(sentence)) continue;
      const names = { mac: /\bmac\b/i.test(sentence), windows: /\bwindows\b/i.test(sentence), linux: /\blinux\b/i.test(sentence) };
      // A sentence naming one served platform answers to that platform's
      // version; one naming several or none is stale only once every served
      // platform serves it. Linux is served only once a Linux release exists.
      const named = Object.keys(served).filter((platform) => names[platform]);
      const platforms = named.length === 1 ? named : Object.keys(served);
      for (const [, version] of sentence.matchAll(/\bversion (\d+(?:\.\d+){1,2})\b/gi)) {
        const stale = platforms.every((p) => atOrBelow(version, served[p]));
        assert.ok(!stale, `${path} promises version ${version}, which the site already serves: "${sentence.trim()}"`);
      }
    }
  }
});

const publicJson = (name) => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8"));

/**
 * What an installed app refuses in public/models.json, mirrored from its two
 * readers in the Koegaki repo so the site never serves an index an app throws
 * away. Mac: Sources/KoegakiCore/ModelMirror/ModelIndex.swift (ModelIndex.decode,
 * isSafeManifestPath, AppVersion.parse). Windows:
 * apps/KoegakiWindows/crates/koegaki-win/src/model_updates.rs (ModelIndex::decode,
 * is_safe_manifest_name, AppVersion::parse) and
 * apps/KoegakiWindows/crates/koegaki-core/src/pathname.rs (is_plain_component).
 * The Mac decodes both of those blocks, so a mistyped Windows entry breaks it
 * too, and every entry here is held to the stricter Windows component rule for
 * its identity and manifest, which every current entry already meets. The
 * linux block is read by the same Rust reader in a Linux build and by nothing
 * else (Koegaki spec 2026-10-13-model-index-linux), and no Linux build before
 * 1.14.0 exists, so a linux min_app is never below it.
 */
function modelIndexProblems(index) {
  const RESERVED = new Set(["CON", "PRN", "AUX", "NUL"]);
  for (let n = 1; n <= 9; n++) RESERVED.add(`COM${n}`).add(`LPT${n}`);
  // ASCII letters, digits, dot, dash and underscore; no leading or trailing
  // dot, no ".part" suffix, and no Windows device name as the stem.
  const plain = (c) =>
    typeof c === "string" &&
    /^[A-Za-z0-9._-]+$/.test(c) &&
    !c.startsWith(".") &&
    !c.endsWith(".") &&
    !c.toLowerCase().endsWith(".part") &&
    !RESERVED.has(c.split(".")[0].toUpperCase());
  const optionalString = (v) => v === undefined || v === null || typeof v === "string";
  // Each min_app part must also fit the integer its reader parses into: a Mac
  // Int for the mac block, a Rust u64 for the windows and linux blocks.
  const LARGEST_PART = { mac: 2n ** 63n - 1n, windows: 2n ** 64n - 1n, linux: 2n ** 64n - 1n };
  const appVersion = (v, platform) =>
    typeof v === "string" &&
    /^[0-9]+(?:\.[0-9]+){0,2}$/.test(v) &&
    v.split(".").every((part) => BigInt(part) <= LARGEST_PART[platform]);
  // The lowest min_app a block may state, compared as the readers compare
  // versions: part by part, a missing part read as zero.
  const FIRST_VERSION = { linux: "1.14.0" };
  const atLeast = (v, floor) => {
    const [a, b] = [v, floor].map((x) => x.split(".").map(BigInt));
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      const [x, y] = [a[k] ?? 0n, b[k] ?? 0n];
      if (x !== y) return x > y;
    }
    return true;
  };
  const problems = [];
  if (!index || typeof index !== "object") return ["the index is not an object"];
  if (index.schema !== 1) problems.push(`schema ${JSON.stringify(index.schema)} is not 1`);
  for (const platform of ["mac", "windows", "linux"]) {
    const block = index[platform];
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      problems.push(`no ${platform} block`);
      continue;
    }
    for (const [id, e] of Object.entries(block)) {
      const at = `${platform}.${id}`;
      if (id === "") problems.push(`${platform}: an empty set id`);
      if (!e || typeof e !== "object") {
        problems.push(`${at}: not an object`);
        continue;
      }
      if (!plain(e.identity)) problems.push(`${at}: identity ${JSON.stringify(e.identity)} is not one plain path component`);
      if (!plain(e.manifest) || !e.manifest.endsWith(".json") || e.manifest.length <= ".json".length) {
        problems.push(`${at}: manifest ${JSON.stringify(e.manifest)} is not one plain JSON file name`);
      }
      if (typeof e.label !== "string" || e.label === "") problems.push(`${at}: label is empty`);
      if (!Number.isSafeInteger(e.bytes) || e.bytes <= 0) problems.push(`${at}: bytes ${JSON.stringify(e.bytes)} is not a positive integer`);
      if (!appVersion(e.min_app, platform)) {
        problems.push(`${at}: min_app ${JSON.stringify(e.min_app)} is not one to three numeric parts its reader can hold`);
      } else if (FIRST_VERSION[platform] && !atLeast(e.min_app, FIRST_VERSION[platform])) {
        problems.push(`${at}: min_app ${e.min_app} is below ${FIRST_VERSION[platform]}, the first version on that platform`);
      }
      if (!optionalString(e.vad)) problems.push(`${at}: vad is not a string`);
      if (!optionalString(e.notes)) problems.push(`${at}: notes is not a string`);
    }
  }
  return problems;
}

/**
 * public/models.json is written in one canonical form: the text
 * JSON.stringify(index, null, 2) writes, plus a newline, as every version of
 * it has been, with every string well formed. JSON.parse forgives forms the
 * readers refuse or read otherwise, so the parsed check above could pass an
 * index a reader throws away or sees differently: 1673007552.0 parses here as
 * an integer and serde refuses it for u64; a member named twice parses as its
 * last value, where serde refuses a repeated field (and decodes every value of
 * a repeated set id) and the Mac decoder keeps the first; a lone surrogate
 * escape parses to a string serde refuses. None of them survives the round
 * trip or the well formed test. Member names are ASCII besides: the Mac
 * decoder keys a dictionary by Swift string equality, under which "\u00e9"
 * and "e\u0301" are one name, where JSON.parse keeps both; ASCII names are
 * equal under every reader only when they are the same. So the parsed check
 * sees what every reader sees. The rule is stricter than the readers on
 * purpose; for a file a tool writes, one form costs nothing.
 */
function modelIndexTextProblems(text) {
  const index = JSON.parse(text);
  const problems = [];
  const canonical = `${JSON.stringify(index, null, 2)}\n`;
  if (text !== canonical) {
    const [given, written] = [text.split("\n"), canonical.split("\n")];
    let line = 0;
    while (given[line] === written[line]) line++;
    problems.push(
      `line ${line + 1} reads ${JSON.stringify(given[line] ?? "")} where JSON.stringify(index, null, 2) writes ${JSON.stringify(written[line] ?? "")}`,
    );
  }
  const names = (v) => (v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...names(x)]) : []);
  const strings = (v) =>
    typeof v === "string" ? [v] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => [k, ...strings(x)]) : [];
  for (const s of strings(index)) {
    if (!s.isWellFormed()) problems.push(`the string ${JSON.stringify(s)} is not well formed`);
  }
  for (const name of names(index)) {
    if (!/^[\x00-\x7f]*$/.test(name)) problems.push(`the member name ${JSON.stringify(name)} is not ASCII`);
  }
  return problems;
}

test("every model index entry passes the rules both app readers apply", () => {
  assert.deepEqual(modelIndexProblems(publicJson("models.json")), []);
  assert.deepEqual(modelIndexTextProblems(readFileSync(new URL("../public/models.json", import.meta.url), "utf8")), []);
});

test("the model index text check refuses every form but the canonical one", () => {
  const text = readFileSync(new URL("../public/models.json", import.meta.url), "utf8");
  // The linux cleanup entry is the only one at 1.14.0 with these bytes.
  const linuxCleanup = '"bytes": 1673007552,\n      "min_app": "1.14.0"';
  const edit = (from, to) => {
    assert.ok(text.includes(from), `the published index no longer holds ${from}`);
    return text.replace(from, to);
  };
  const mutations = [
    // Each of these parses here and a reader refuses it or reads it otherwise.
    ["linux bytes with a fraction", edit(linuxCleanup, linuxCleanup.replace("1673007552", "1673007552.0"))],
    ["linux bytes with an exponent", edit(linuxCleanup, linuxCleanup.replace("1673007552", "1.673007552e9"))],
    ["windows bytes with a fraction", edit('"bytes": 488914608,\n      "min_app": "1.7.0"', '"bytes": 488914608.0,\n      "min_app": "1.7.0"')],
    ["a schema with a fraction", edit('"schema": 1,', '"schema": 1.0,')],
    ["the schema twice", edit('"schema": 1,', '"schema": 1,\n  "schema": 1,')],
    ["the linux block twice", edit('\n  "linux": {', '\n  "linux": {},\n  "linux": {')],
    ["the windows block twice", edit('\n  "windows": {', '\n  "windows": {},\n  "windows": {')],
    ["the mac block twice", edit('\n  "mac": {', '\n  "mac": {},\n  "mac": {')],
    ["a malformed linux set id before the real one", edit('\n  "linux": {', '\n  "linux": {\n    "cleanup": {},')],
    ["a mac set id twice", edit('\n  "mac": {', '\n  "mac": {\n    "cleanup": {},')],
    ["a windows set id twice", edit('\n  "windows": {', '\n  "windows": {\n    "cleanup": {},')],
    ["a linux entry field twice", edit(linuxCleanup, `${linuxCleanup},\n      "min_app": "1.14.0"`)],
    ["a member name spelled with an escape", edit(linuxCleanup, linuxCleanup.replace('"bytes"', '"by\\u0074es"'))],
    ["a lone surrogate in a label", edit('"label": "Cleanup model"', '"label": "\\ud800"')],
    // Stricter than the readers on purpose: one canonical form.
    ["a mac entry field repeated with the same value", edit('"min_app": "1.3.1",', '"min_app": "1.3.1",\n      "min_app": "1.3.1",')],
    ["mac bytes with a zero fraction", edit('"bytes": 1673007552,\n      "min_app": "1.3.1"', '"bytes": 1673007552.0,\n      "min_app": "1.3.1"')],
    ["four space indentation", text.replace(/\n( +)/g, (m, sp) => `\n${sp}${sp}`)],
  ];
  for (const [, mutated] of mutations) assert.notEqual(mutated, text);
  for (const [, mutated] of mutations) JSON.parse(mutated);
  // Written the canonical way, whatever they hold.
  const canonical = (mutate) => {
    const index = JSON.parse(text);
    mutate(index);
    return `${JSON.stringify(index, null, 2)}\n`;
  };
  // Canonical, yet the Mac decoder keys its dictionary by Swift string
  // equality, under which these two names are one: it keeps one entry where
  // JSON.parse keeps two.
  mutations.push([
    "two set ids one Unicode normalization apart",
    canonical((i) => {
      i.mac["\u00e9"] = i.mac.cleanup;
      i.mac["e\u0301"] = i.mac.cleanup;
    }),
  ]);
  const missed = mutations.filter(([, mutated]) => modelIndexTextProblems(mutated).length === 0);
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const accepted = [
    ["the index as published", text],
    ["a string holding a dot and digits", canonical((i) => (i.linux.cleanup.label = "Cleanup model 1.5e3"))],
    ["a string holding an escaped quote", canonical((i) => (i.mac.cleanup.notes = 'a "1.0": x'))],
    ["a string beyond ASCII, a surrogate pair included", canonical((i) => (i.windows.cleanup.notes = "caf\u00e9 \u{1D11E}"))],
    ["a fraction inside an unknown entry field", canonical((i) => (i.linux.cleanup.metadata = [1.5]))],
    ["an unknown top level member with a fraction", canonical((i) => (i.generated = 1.5))],
  ];
  const refused = accepted.map(([name, t]) => [name, modelIndexTextProblems(t)]).filter(([, problems]) => problems.length);
  assert.deepEqual(refused, [], "these were refused");
});

test("the model index check refuses what the app readers refuse", () => {
  const index = publicJson("models.json");
  const mutations = [
    ["schema 99", (i) => (i.schema = 99), /schema/],
    ["a manifest outside the mirror root", (i) => (i.windows.cleanup.manifest = "../bad.json"), /windows\.cleanup: manifest/],
    ["zero bytes", (i) => (i.mac["speech-multilingual"].bytes = 0), /mac\.speech-multilingual: bytes/],
    ["bytes as a string", (i) => (i.windows["speech-english"].bytes = "488914608"), /windows\.speech-english: bytes/],
    ["a min_app that is not a version", (i) => (i.windows["speech-multilingual"].min_app = "x"), /windows\.speech-multilingual: min_app/],
    ["an identity with a slash", (i) => (i.mac.cleanup.identity = "cleanup/qwen3"), /mac\.cleanup: identity/],
    ["an identity with a leading dot", (i) => (i.windows.cleanup.identity = ".cleanup"), /windows\.cleanup: identity/],
    ["an identity with a trailing dot", (i) => (i.mac["speech-english"].identity = "parakeet-ultra."), /mac\.speech-english: identity/],
    ["an identity named like a partial download", (i) => (i.windows["speech-english"].identity = "ultra.part"), /windows\.speech-english: identity/],
    ["an identity that is not ASCII", (i) => (i.mac["speech-multilingual"].identity = "whisper-turbo-\u00e9"), /mac\.speech-multilingual: identity/],
    ["a manifest named after a Windows device", (i) => (i.mac.cleanup.manifest = "CON.json"), /mac\.cleanup: manifest/],
    ["a manifest that is not JSON", (i) => (i.windows["speech-multilingual"].manifest = "manifest-1.txt"), /windows\.speech-multilingual: manifest/],
    ["a vad that is not a string", (i) => (i.windows["speech-english"].vad = 6), /windows\.speech-english: vad/],
    ["an empty label", (i) => (i.mac["speech-english"].label = ""), /mac\.speech-english: label/],
    ["no windows block", (i) => delete i.windows, /windows block/],
    ["a Windows min_app part above u64", (i) => (i.windows["speech-english"].min_app = "18446744073709551616"), /windows\.speech-english: min_app/],
    ["a Mac min_app part above Int", (i) => (i.mac.cleanup.min_app = "9223372036854775808"), /mac\.cleanup: min_app/],
    ["no linux block", (i) => delete i.linux, /linux block/],
    ["a linux identity with a slash", (i) => (i.linux.cleanup.identity = "cleanup/qwen3"), /linux\.cleanup: identity/],
    ["a linux manifest outside the mirror root", (i) => (i.linux["speech-english"].manifest = "../bad.json"), /linux\.speech-english: manifest/],
    ["linux bytes as a string", (i) => (i.linux["speech-multilingual"].bytes = "563790207"), /linux\.speech-multilingual: bytes/],
    ["a linux vad that is not a string", (i) => (i.linux["speech-english"].vad = 6), /linux\.speech-english: vad/],
    ["a linux min_app part above u64", (i) => (i.linux.cleanup.min_app = "18446744073709551616"), /linux\.cleanup: min_app/],
    ["a linux min_app below the first Linux version", (i) => (i.linux.cleanup.min_app = "1.13.1"), /linux\.cleanup: min_app/],
    ["a linux min_app of one part below it", (i) => (i.linux["speech-english"].min_app = "1"), /linux\.speech-english: min_app/],
  ];
  const accepted = [
    ["the index as published", () => {}],
    ["a Windows min_app part at the u64 limit", (i) => (i.windows["speech-english"].min_app = "18446744073709551615")],
    ["a Mac min_app part at the Int limit", (i) => (i.mac.cleanup.min_app = "9223372036854775807")],
    ["a linux min_app part at the u64 limit", (i) => (i.linux.cleanup.min_app = "18446744073709551615")],
    ["a linux min_app above the first Linux version", (i) => (i.linux.cleanup.min_app = "1.14.1")],
    ["a linux min_app of two parts at the first Linux version", (i) => (i.linux.cleanup.min_app = "1.14")],
  ];
  const problemsAfter = (mutate) => {
    const copy = structuredClone(index);
    mutate(copy);
    return modelIndexProblems(copy);
  };
  const missed = mutations.filter(([, mutate, expected]) => !problemsAfter(mutate).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const refused = accepted.map(([name, mutate]) => [name, problemsAfter(mutate)]).filter(([, problems]) => problems.length);
  assert.deepEqual(refused, [], "these were refused");
});

/**
 * Release records. From 1.9.1 the installers are assets of a GitHub release in
 * vishutdhar/koegaki-releases rather than files in public/downloads, so the
 * bytes the checks below once read from this repository are no longer here.
 * Tools/publish-release.sh in the Koegaki repo uploads them, downloads each one
 * back to compare, and writes what it published to releases/<version>.json,
 * outside public/ so the site never serves it. A release that ships on one
 * platform only, as 1.12.0 ships on the Mac, publishes and records that
 * platform's artifact alone, so a record states a dmg, an exe or both:
 *
 *   { "version": "1.9.1", "note": "optional text",
 *     "artifacts": {
 *       "dmg": { "url": ..., "size": ..., "sha256": ..., "blake2b512": ... },
 *       "exe": { "url": ..., "size": ..., "sha256": ..., "blake2b512": ..., "signature": ... } } }
 *
 * Each url is the release asset, size its length in bytes, sha256 and
 * blake2b512 lowercase hex digests of the whole file, and signature the
 * updater signature public/windows-updates.json carries, which signs that
 * BLAKE2b-512 digest and so ties the record to the signed installer. That
 * digest is the only field the checks here can authenticate; the sizes, the
 * SHA-256 digests and the disk image's BLAKE2b-512 are held to their shape,
 * to each other where the manifest and the appcast repeat them, and to the
 * bytes where public/downloads still holds the installer. Otherwise they rest
 * on the publishing tool, which measured them on the files it downloaded back
 * from the release, and on the test that downloads the release again
 * (RELEASE_FETCH=1, see the top of this file).
 */
const RELEASES = new URL("../releases/", import.meta.url);
/** The fixture's records, read beside the real ones in the fixture run only. */
const FIXTURE_RELEASES = new URL("fixtures/linux-release/", import.meta.url);
/** Whether the record of `version` is the fixture's, in the fixture run. */
const fromFixture = (version) => LINUX_FIXTURE && existsSync(new URL(`${version}.json`, FIXTURE_RELEASES));
const GITHUB_DOWNLOAD = "https://github.com/vishutdhar/koegaki-releases/releases/download";
/** The namespace of Sparkle's appcast elements and attributes, whatever prefix a feed binds it to. */
const SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle";
/** The Vercel Blob host the disk images and the updater's installers through 1.9.0 were served from. */
const BLOB_HOST = "npdal36mxz3kcwxv.public.blob.vercel-storage.com";
const ASSET_NAME = {
  dmg: (version) => `Koegaki-${version}.dmg`,
  exe: (version) => `Koegaki-${version}-setup.exe`,
  deb: (version) => `Koegaki-${version}-amd64.deb`,
};
/** What each kind of asset is called in a problem. */
const ASSET_WORD = { dmg: "disk image", exe: "installer", deb: "deb package" };
/** The one url a GitHub release asset of this version and kind ("dmg", "exe" or "deb") is served from. */
const githubAssetUrl = (version, kind) => `${GITHUB_DOWNLOAD}/v${version}/${ASSET_NAME[kind](version)}`;
/**
 * The fields of each artifact, as the publishing tool writes them (Koegaki
 * Tools/publish-release.sh, spec 2026-10-13-publish-tool-linux-and-windows-only
 * rule 6): the installer and the deb carry the updater signature the app checks
 * an update against, the disk image none (Sparkle's is in the appcast).
 */
const RECORD_FIELDS = {
  dmg: ["url", "size", "sha256", "blake2b512"],
  exe: ["url", "size", "sha256", "blake2b512", "signature"],
  deb: ["url", "size", "sha256", "blake2b512", "signature"],
};
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/** The kinds of artifact a well formed record states, any of "dmg", "exe" and "deb", in that order. */
const recordedKinds = (record) => Object.keys(RECORD_FIELDS).filter((kind) => Object.hasOwn(record.artifacts, kind));

/**
 * The parsed releases/<version>.json, or undefined when there is none or the
 * version could not name one. In the fixture run the fixture's record of a
 * version stands in for any real one.
 */
function releaseRecord(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return undefined;
  const file = new URL(`${version}.json`, fromFixture(version) ? FIXTURE_RELEASES : RELEASES);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

/** What is wrong with a record of this version: its keys, its version, and each artifact's url, size and digests. */
function releaseRecordProblems(record, version) {
  if (!isPlainObject(record)) return ["the record is not an object"];
  const problems = [];
  const sameKeys = (object, expected) => Object.keys(object).sort().join() === [...expected].sort().join();
  if (!sameKeys(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "note")), ["version", "artifacts"])) {
    problems.push(`the record holds ${JSON.stringify(Object.keys(record))}, not version, artifacts and an optional note`);
  }
  if (record.version !== version) problems.push(`the record names version ${JSON.stringify(record.version)}, not ${version}`);
  if ("note" in record && typeof record.note !== "string") problems.push("the note is not a string");
  if (!isPlainObject(record.artifacts)) return [...problems, "artifacts is not an object"];
  const kinds = Object.keys(record.artifacts);
  if (kinds.length === 0 || !kinds.every((kind) => Object.hasOwn(RECORD_FIELDS, kind))) {
    return [...problems, `artifacts holds ${JSON.stringify(kinds)}, not one or more of a dmg, an exe and a deb`];
  }
  for (const kind of kinds) {
    const fields = RECORD_FIELDS[kind];
    const artifact = record.artifacts[kind];
    if (!isPlainObject(artifact)) {
      problems.push(`${kind} is not an object`);
      continue;
    }
    if (!sameKeys(artifact, fields)) problems.push(`${kind} holds ${JSON.stringify(Object.keys(artifact))}, not ${fields.join(", ")}`);
    const url = githubAssetUrl(version, kind);
    if (artifact.url !== url) problems.push(`${kind}: url ${JSON.stringify(artifact.url)} is not ${url}`);
    if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) problems.push(`${kind}: size ${JSON.stringify(artifact.size)} is not a positive integer`);
    for (const [digest, length] of [["sha256", 64], ["blake2b512", 128]]) {
      if (typeof artifact[digest] !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(artifact[digest])) {
        problems.push(`${kind}: ${digest} ${JSON.stringify(artifact[digest])} is not ${length} lowercase hex digits`);
      }
    }
  }
  for (const kind of ["exe", "deb"]) {
    if (isPlainObject(record.artifacts[kind]) && (typeof record.artifacts[kind].signature !== "string" || record.artifacts[kind].signature === "")) {
      problems.push(`${kind}: signature is not a string`);
    }
  }
  return problems;
}

/**
 * Every record in releases/, by version, and in the fixture run the fixture's
 * too; a file named anything but <version>.json is reported under its name.
 */
function releaseRecords() {
  const names = new Set(readdirSync(RELEASES));
  if (LINUX_FIXTURE) for (const name of readdirSync(FIXTURE_RELEASES)) names.add(name);
  return [...names].sort().map((name) => {
    const version = name.match(/^(\d+\.\d+\.\d+)\.json$/)?.[1];
    return { name, version, record: version && releaseRecord(version) };
  });
}

/**
 * The record of a release that ships on the Mac only, as 1.12.0 does: its disk
 * image and no installer, while the update manifest and the Windows download
 * link stay at the release before it. It is here for the self tests alone,
 * which try every check that reads a record against it; the real
 * releases/1.12.0.json lands with the release. Its digests are of
 * MAC_ONLY_DMG, bytes made for these tests.
 */
const MAC_ONLY_DMG = createHash("sha512").update("the disk image of a Mac only release, made for the self tests").digest();
const MAC_ONLY_RECORD = Object.freeze({
  version: "1.12.0",
  artifacts: Object.freeze({
    dmg: Object.freeze({
      url: githubAssetUrl("1.12.0", "dmg"),
      size: MAC_ONLY_DMG.length,
      sha256: createHash("sha256").update(MAC_ONLY_DMG).digest("hex"),
      blake2b512: createHash("blake2b512").update(MAC_ONLY_DMG).digest("hex"),
    }),
  }),
});

/**
 * A minisign key in Tauri's format, made for the self tests: `pubkey`, the
 * base64 text a tauri.conf.json carries, and `sign(digest, file)`, the base64
 * signature text `cargo tauri signer sign` writes for a file of that name
 * whose BLAKE2b-512 digest is `digest` (prehashed Ed25519 over the digest, and
 * a global signature over that signature and the trusted comment).
 */
function minisignKey() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const keyId = createHash("sha256").update(raw).digest().subarray(0, 8);
  const text = (lines) => Buffer.from(`${lines.join("\n")}\n`).toString("base64");
  return {
    pubkey: text(["untrusted comment: minisign public key", Buffer.concat([Buffer.from("Ed"), keyId, raw]).toString("base64")]),
    sign(digest, file) {
      const signature = sign(null, digest, privateKey);
      const trusted = `timestamp:1792000000\tfile:${file}`;
      const global = sign(null, Buffer.concat([signature, Buffer.from(trusted)]), privateKey);
      return text([
        "untrusted comment: signature from tauri secret key",
        Buffer.concat([Buffer.from("ED"), keyId, signature]).toString("base64"),
        `trusted comment: ${trusted}`,
        global.toString("base64"),
      ]);
    },
  };
}

/** The file name the bundler gives the deb of `version`, which its updater signature names. */
const bundlerDebName = (version) => `com.vishutdhar.Koegaki_${version}_amd64.deb`;

/**
 * The record of a release that ships on Linux only, as 1.14.0 will: its deb
 * and nothing else, signed with LINUX_ONLY_KEY, a key made for these self
 * tests. Its digests are of LINUX_ONLY_DEB, bytes made for the tests; the
 * real releases/1.14.0.json lands with the release.
 */
const LINUX_ONLY_DEB = createHash("sha512").update("the deb of a Linux only release, made for the self tests").digest();
const LINUX_ONLY_KEY = minisignKey();
const LINUX_ONLY_RECORD = Object.freeze({
  version: "1.14.0",
  artifacts: Object.freeze({
    deb: Object.freeze({
      url: githubAssetUrl("1.14.0", "deb"),
      size: LINUX_ONLY_DEB.length,
      sha256: createHash("sha256").update(LINUX_ONLY_DEB).digest("hex"),
      blake2b512: createHash("blake2b512").update(LINUX_ONLY_DEB).digest("hex"),
      signature: LINUX_ONLY_KEY.sign(createHash("blake2b512").update(LINUX_ONLY_DEB).digest(), bundlerDebName("1.14.0")),
    }),
  }),
});

/** MAC_ONLY_RECORD restated as the record of `version`: a release with no deb. */
const MAC_ONLY_RECORD_AS = (version) => {
  const copy = structuredClone(MAC_ONLY_RECORD);
  copy.version = version;
  copy.artifacts.dmg.url = githubAssetUrl(version, "dmg");
  return copy;
};

/** `sources`, finding LINUX_ONLY_RECORD as the record of its release. */
const withLinuxOnlyRelease = (sources) => ({
  installer: sources.installer,
  record: (version) => (version === LINUX_ONLY_RECORD.version ? LINUX_ONLY_RECORD : sources.record(version)),
});

/** `sources` (see windowsUpdateProblems), finding MAC_ONLY_RECORD as the record of its release. */
const withMacOnlyRelease = (sources) => ({
  installer: sources.installer,
  record: (version) => (version === MAC_ONLY_RECORD.version ? MAC_ONLY_RECORD : sources.record(version)),
});

/** `sources`, finding the record of `version` without its `kind` artifact, as a release that shipped on the other platform only states it. */
const withoutArtifact = (sources, version, kind) => ({
  installer: sources.installer,
  record: (release) => {
    const record = sources.record(release);
    if (release !== version || !record) return record;
    const copy = structuredClone(record);
    delete copy.artifacts[kind];
    return copy;
  },
});

test("every release record has the published shape and describes the same bytes as an installer public/downloads still holds", () => {
  const records = releaseRecords();
  assert.ok(records.length > 0, "releases/ holds no record");
  for (const { name, version, record } of records) {
    assert.ok(version, `releases/${name} is not named <version>.json`);
    assert.deepEqual(releaseRecordProblems(record, version), [], `releases/${name}`);
    // 1.9.0 and earlier shipped from this repository, so where the installer is
    // here too, the record must describe exactly those bytes.
    const local = new URL(`../public/downloads/${ASSET_NAME.exe(version)}`, import.meta.url);
    if (!existsSync(local)) continue;
    const bytes = readFileSync(local);
    const { size, sha256, blake2b512 } = record.artifacts.exe;
    assert.deepEqual(
      { size, sha256, blake2b512 },
      { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), blake2b512: createHash("blake2b512").update(bytes).digest("hex") },
      `releases/${name} does not describe public/downloads/${ASSET_NAME.exe(version)}`,
    );
  }
});

test("the release record check refuses a record that is malformed or names another release, and passes any set of a disk image, an installer and a deb", () => {
  const record = releaseRecord("1.9.0");
  assert.ok(record, "releases/1.9.0.json, the record these cases start from, is missing");
  const refused = [
    ["another version", (r) => (r.version = "1.9.1"), /names version "1\.9\.1"/],
    ["an unknown top level key", (r) => (r.extra = 1), /the record holds/],
    ["a note that is not text", (r) => (r.note = 7), /note is not a string/],
    ["no artifact at all", (r) => (r.artifacts = {}), /artifacts holds \[\], not one or more of a dmg, an exe and a deb/],
    ["artifacts that are a list", (r) => (r.artifacts = [r.artifacts.dmg, r.artifacts.exe]), /artifacts is not an object/],
    ["no artifacts", (r) => delete r.artifacts, /artifacts is not an object/],
    ["a fourth artifact", (r) => (r.artifacts.zip = {}), /artifacts holds .*"zip"/],
    ["an rpm, which no release has", (r) => (r.artifacts.rpm = { ...r.artifacts.exe, url: r.artifacts.exe.url.replace(/[^/]+$/, "Koegaki-1.9.0.x86_64.rpm") }), /artifacts holds .*"rpm"/],
    ["an artifact named after an object property", (r) => (r.artifacts.toString = r.artifacts.dmg), /artifacts holds .*"toString"/],
    ["an exe with no signature", (r) => delete r.artifacts.exe.signature, /exe holds/],
    ["a dmg with a signature", (r) => (r.artifacts.dmg.signature = "x"), /dmg holds/],
    ["an empty signature", (r) => (r.artifacts.exe.signature = ""), /exe: signature/],
    ["a dmg url on another tag", (r) => (r.artifacts.dmg.url = r.artifacts.dmg.url.replace("/v1.9.0/", "/v1.9.1/")), /dmg: url/],
    ["an exe url in another repo", (r) => (r.artifacts.exe.url = r.artifacts.exe.url.replace("/koegaki-releases/", "/koegaki/")), /exe: url/],
    ["an exe url of another owner", (r) => (r.artifacts.exe.url = r.artifacts.exe.url.replace("/vishutdhar/", "/someone/")), /exe: url/],
    ["a dmg url with another asset name", (r) => (r.artifacts.dmg.url = r.artifacts.dmg.url.replace(/Koegaki-1\.9\.0\.dmg$/, "Koegaki.dmg")), /dmg: url/],
    ["a size as text", (r) => (r.artifacts.dmg.size = String(r.artifacts.dmg.size)), /dmg: size/],
    ["a zero size", (r) => (r.artifacts.exe.size = 0), /exe: size/],
    ["an uppercase digest", (r) => (r.artifacts.exe.sha256 = r.artifacts.exe.sha256.toUpperCase()), /exe: sha256/],
    ["a short digest", (r) => (r.artifacts.dmg.blake2b512 = r.artifacts.dmg.blake2b512.slice(2)), /dmg: blake2b512/],
    ["a digest that is not hex", (r) => (r.artifacts.exe.blake2b512 = `${r.artifacts.exe.blake2b512.slice(1)}g`), /exe: blake2b512/],
  ];
  // A release that ships on the Mac only records its disk image alone; the
  // same checks hold that one artifact, and an installer added beside it is
  // held to every field an installer needs.
  const macOnly = MAC_ONLY_RECORD.version;
  const macOnlyRefused = [
    ["an empty installer beside the disk image", (r) => (r.artifacts.exe = {}), /exe holds/],
    [
      "an installer with no url beside the disk image",
      (r) => {
        r.artifacts.exe = structuredClone(record.artifacts.exe);
        delete r.artifacts.exe.url;
      },
      /exe: url undefined is not/,
    ],
    ["an installer that is not an object beside the disk image", (r) => (r.artifacts.exe = null), /exe is not an object/],
    ["no disk image either", (r) => delete r.artifacts.dmg, /artifacts holds \[\]/],
    ["a disk image url on another tag", (r) => (r.artifacts.dmg.url = r.artifacts.dmg.url.replace(`/v${macOnly}/`, "/v1.11.1/")), /dmg: url/],
    ["a disk image with a signature", (r) => (r.artifacts.dmg.signature = "x"), /dmg holds/],
    ["a disk image with no size", (r) => delete r.artifacts.dmg.size, /dmg: size undefined/],
    ["another version", (r) => (r.version = "1.11.1"), /names version "1\.11\.1"/],
  ];
  // A release that ships on Linux only records its deb alone, with the
  // updater signature the publishing tool writes for it, and a deb beside
  // the other two is held to the same fields.
  const linuxOnly = LINUX_ONLY_RECORD.version;
  const linuxOnlyRefused = [
    ["a deb with no signature", (r) => delete r.artifacts.deb.signature, /deb holds/],
    ["a deb with an empty signature", (r) => (r.artifacts.deb.signature = ""), /deb: signature is not a string/],
    ["a deb with a signature that is not text", (r) => (r.artifacts.deb.signature = 7), /deb: signature is not a string/],
    ["a deb with another field", (r) => (r.artifacts.deb.notes = "x"), /deb holds/],
    ["a deb named as an installer", (r) => (r.artifacts.deb.url = githubAssetUrl(linuxOnly, "exe")), /deb: url/],
    ["a deb named as the bundler names it", (r) => (r.artifacts.deb.url = r.artifacts.deb.url.replace(/[^/]+$/, bundlerDebName(linuxOnly))), /deb: url/],
    ["a deb on another tag", (r) => (r.artifacts.deb.url = r.artifacts.deb.url.replace(`/v${linuxOnly}/`, "/v1.13.1/")), /deb: url/],
    ["a deb with no size", (r) => delete r.artifacts.deb.size, /deb: size undefined/],
    ["a deb with an uppercase digest", (r) => (r.artifacts.deb.sha256 = r.artifacts.deb.sha256.toUpperCase()), /deb: sha256/],
    ["a deb that is not an object", (r) => (r.artifacts.deb = null), /deb is not an object/],
    ["a deb key misspelled", (r) => { r.artifacts.debs = r.artifacts.deb; delete r.artifacts.deb; }, /artifacts holds \["debs"\]/],
    ["no deb either", (r) => delete r.artifacts.deb, /artifacts holds \[\]/],
  ];
  const problemsAfter = (mutate, from = record, version = "1.9.0") => {
    const copy = structuredClone(from);
    mutate(copy);
    return releaseRecordProblems(copy, version);
  };
  const missed = [
    ...refused.filter(([, mutate, expected]) => !problemsAfter(mutate).some((p) => expected.test(p))),
    ...macOnlyRefused.filter(([, mutate, expected]) => !problemsAfter(mutate, MAC_ONLY_RECORD, macOnly).some((p) => expected.test(p))),
    ...linuxOnlyRefused.filter(([, mutate, expected]) => !problemsAfter(mutate, LINUX_ONLY_RECORD, linuxOnly).some((p) => expected.test(p))),
  ];
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const accepted = [
    ["the record as committed", [() => {}]],
    ["a record with no note", [(r) => delete r.note]],
    ["a disk image alone, as a Mac only release records it", [() => {}, MAC_ONLY_RECORD, macOnly]],
    ["an installer alone, as a Windows only release would record it", [(r) => delete r.artifacts.dmg]],
    ["a deb alone, as a Linux only release records it", [() => {}, LINUX_ONLY_RECORD, linuxOnly]],
    ["all three, as a release for every platform records them", [(r) => (r.artifacts.deb = { ...structuredClone(LINUX_ONLY_RECORD.artifacts.deb), url: githubAssetUrl("1.9.0", "deb") })]],
    [
      "an installer and a deb",
      [
        (r) => {
          delete r.artifacts.dmg;
          r.artifacts.deb = { ...structuredClone(LINUX_ONLY_RECORD.artifacts.deb), url: githubAssetUrl("1.9.0", "deb") };
        },
      ],
    ],
    [
      "a disk image and a deb",
      [
        (r) => {
          delete r.artifacts.exe;
          r.artifacts.deb = { ...structuredClone(LINUX_ONLY_RECORD.artifacts.deb), url: githubAssetUrl("1.9.0", "deb") };
        },
      ],
    ],
  ];
  const wronglyRefused = accepted.map(([name, args]) => [name, problemsAfter(...args)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

/**
 * The Windows updater's public key, copied from the Koegaki repo
 * (apps/KoegakiWindows/src-tauri/tauri.conf.json, plugins.updater.pubkey). Every
 * installed Windows build checks an update against it, so a manifest that does
 * not verify here is an update no PC will install.
 */
const WINDOWS_UPDATER_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVFQjY3RUQzRENFNDQ1OUEKUldTYVJlVGMwMzYyN2gxZS9nL2VjMmkyQU9RclhvT2t4MWQxeDZKa0FkYysvMUtGVGVTZGxYZFEK";

/**
 * The key the Linux build checks an update against: plugins.updater.pubkey of
 * the Koegaki repo's tauri.linux.conf.json when that overlay sets one, and of
 * tauri.conf.json otherwise (Tauri merges the overlay over the base, and the
 * publishing tool follows the same rule, spec
 * 2026-10-13-publish-tool-linux-and-windows-only rule 5). At Koegaki 62246245
 * the overlay sets none, so it is the Windows key. In the fixture run the
 * fixture's records are signed with LINUX_FIXTURE_PUBKEY instead (linuxKeyFor).
 */
const LINUX_UPDATER_PUBKEY = WINDOWS_UPDATER_PUBKEY;

/**
 * The public key of the throwaway key the fixture's 1.14.0 deb
 * (tests/fixtures/linux-release/1.14.0.json) was signed with. The private key
 * was not kept: nothing but that one record was ever signed with it.
 */
const LINUX_FIXTURE_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEYxMzg3NEUzNUM2OTc4OTEKUldTUmVHbGM0M1E0OFp0bzNaNHFhN0Z3R0hKbjFnNDVEc0xISU1BMlR4T0NuRHNBYUlEdHo0MVIK";

/** The key the deb of `version` is checked against: the fixture's for a fixture record, the Linux build's otherwise. */
const linuxKeyFor = (version) => (fromFixture(version) ? LINUX_FIXTURE_PUBKEY : LINUX_UPDATER_PUBKEY);

/** The DER prefix that turns a raw 32 byte Ed25519 key into an SPKI public key. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * The bytes of canonical base64 text, or undefined. Node's decoder skips
 * characters it does not know, so "abc!" would decode as "abc" here while the
 * updater refuses it; only text that re-encodes to itself passes.
 */
function canonicalBase64(text) {
  if (typeof text !== "string" || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return undefined;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? bytes : undefined;
}

/**
 * Check a Tauri updater signature as the updater does. It is a minisign
 * signature, base64 text whose second line is "ED" (prehashed Ed25519), the
 * 8 byte key id and the 64 byte signature of the installer's BLAKE2b-512
 * digest; the fourth line signs those 64 bytes followed by the trusted comment
 * (third line), which names the signed file. The key's second line is "Ed", the
 * same key id and the 32 byte key. Ed25519 signs the digest, not the file, so
 * the digest alone is the whole check: `digest` is those 64 bytes, of the
 * installer itself or as a release record states them. Returns what failed and
 * the trusted comment.
 */
function updaterSignatureProblems(digest, signature, pubkey, what = "installer") {
  // The updater reads the decoded bytes as strict UTF-8 (str::from_utf8, which
  // keeps a byte order mark), then splits them with Rust's lines(), which ends a
  // line at "\n" and drops a "\r" before it, so a CRLF signature reads the same.
  const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const lines = (bytes) => {
    try {
      return utf8.decode(bytes).split(/\r?\n/);
    } catch {
      return undefined;
    }
  };
  const keyBytes = canonicalBase64(pubkey);
  if (!keyBytes) return { problems: ["the key is not canonical base64"] };
  const keyText = lines(keyBytes);
  if (!keyText) return { problems: ["the key is not UTF-8"] };
  const key = canonicalBase64(keyText[1] ?? "");
  if (!key) return { problems: ["the key line is not canonical base64"] };
  const signatureBytes = canonicalBase64(signature);
  if (!signatureBytes) return { problems: ["the signature is not canonical base64"] };
  const signatureText = lines(signatureBytes);
  if (!signatureText) return { problems: ["the signature is not UTF-8"] };
  const [, sigLine = "", trustedLine = "", globalLine = ""] = signatureText;
  const sig = canonicalBase64(sigLine);
  if (!sig) return { problems: ["the signature line is not canonical base64"] };
  const prefix = "trusted comment: ";
  const trusted = trustedLine.startsWith(prefix) ? trustedLine.slice(prefix.length) : undefined;
  if (key.length !== 42 || key.subarray(0, 2).toString() !== "Ed") return { problems: ["not an Ed25519 minisign key"], trusted };
  if (sig.length !== 74 || sig.subarray(0, 2).toString() !== "ED") {
    return { problems: ["not a prehashed Ed25519 minisign signature"], trusted };
  }
  const problems = [];
  if (!key.subarray(2, 10).equals(sig.subarray(2, 10))) problems.push("the key ids differ");
  const publicKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, key.subarray(10)]), format: "der", type: "spki" });
  if (!verify(null, digest, publicKey, sig.subarray(10))) problems.push(`the ${what} signature does not verify`);
  const global = canonicalBase64(globalLine);
  if (!global) problems.push("the trusted comment signature line is not canonical base64");
  else if (trusted === undefined) problems.push("no trusted comment");
  else if (global.length !== 64 || !verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), publicKey, global)) {
    problems.push("the trusted comment signature does not verify");
  }
  return { problems, trusted };
}

/**
 * An RFC 3339 date and time that names a real instant: the fields as written
 * survive a round trip through Date, so 30 February or hour 25 are refused
 * rather than rolled over into another day.
 */
function rfc3339Problem(date) {
  const m = typeof date === "string" && date.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/);
  if (!m) return `pub_date ${JSON.stringify(date)} is not RFC 3339`;
  const written = m.slice(1, 7).map(Number);
  const [year, month, day, hour, minute, second] = written;
  const wall = new Date(0);
  wall.setUTCFullYear(year, month - 1, day);
  wall.setUTCHours(hour, minute, second, Number((m[7] ?? ".").slice(1, 4).padEnd(3, "0")));
  const fields = [wall.getUTCFullYear(), wall.getUTCMonth() + 1, wall.getUTCDate(), wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds()];
  const offsetMinutes = m[8] ? (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10])) : 0;
  const parsed = new Date(date);
  const instant = Number.isNaN(parsed.getTime()) ? NaN : new Date(parsed.toISOString()).getTime();
  if (fields.join() !== written.join() || instant !== wall.getTime() - offsetMinutes * 60_000) {
    return `pub_date ${date} is not a real instant`;
  }
  return undefined;
}

/** An https url with a host, nothing after the path, and the installer's name as the whole path. */
function updaterUrlProblem(url, version) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `the url ${JSON.stringify(url)} does not parse`;
  }
  const exact =
    parsed.protocol === "https:" &&
    parsed.hostname !== "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    parsed.pathname === `/Koegaki-${version}-setup.exe` &&
    parsed.href === url;
  return exact ? undefined : `the url ${url} is not https://<host>/Koegaki-${version}-setup.exe`;
}

/** The path of a url with its percent escapes decoded, or undefined when it does not parse or decode. */
function decodedPath(url) {
  if (typeof url !== "string" || !URL.canParse(url)) return undefined;
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return undefined;
  }
}

/** The host of a url with any port that is not the default, or undefined when it does not parse. */
const hostOf = (url) => (typeof url === "string" && URL.canParse(url) ? new URL(url).host : undefined);

/**
 * Why a release cannot be on GitHub, or undefined. public/downloads holds the
 * installers of every release that shipped before releases moved to GitHub,
 * and nothing new lands there, so a GitHub url never names one of those; this
 * keeps releases/1.9.0.json, which exists for the self tests, from letting a
 * manifest or appcast point at a v1.9.0 release that was never published.
 */
function frozenReleaseProblem(version, sources) {
  if (!sources.installer(version)) return undefined;
  return `${ASSET_NAME.exe(version)} is in public/downloads, so ${version} shipped before releases moved to GitHub and no GitHub release of it exists`;
}

/**
 * Why a release cannot be served from a host releases used before GitHub
 * (koegaki.com/downloads, or the Blob host), or undefined. A release with a
 * record in releases/ was published as a GitHub release, so every download
 * link, the updater manifest and the appcast serve it from github.com. The one
 * exception is a release public/downloads holds: it shipped from there before
 * releases moved to GitHub, and its record (1.9.0's) exists only so the self
 * tests run against a real signed release (see frozenReleaseProblem).
 */
function legacyHostProblem(version, sources) {
  if (!sources.record(version) || sources.installer(version)) return undefined;
  return `releases/${version}.json records ${version} as a GitHub release, which is served from github.com only`;
}

/**
 * The BLAKE2b-512 digest of the installer the manifest's url serves, and what
 * stops it being known. A url on github.com must be exactly the release asset
 * of this version, of a release that did not ship from public/downloads, and
 * the digest is the one its record states, which the signature check then
 * holds to the signed installer. Otherwise the url must be on the Blob host,
 * where the updater fetched every installer shipped from this repository
 * through 1.9.0, of a release with no record but one public/downloads holds
 * (see legacyHostProblem), so its bytes are read from public/downloads, and a
 * record never stands in for them.
 */
function installerDigest(target, version, sources) {
  const problems = [];
  if (hostOf(target.url) === "github.com") {
    const asset = githubAssetUrl(version, "exe");
    if (target.url !== asset) problems.push(`the url ${target.url} is not ${asset}, the GitHub release asset of ${version}`);
    const frozen = frozenReleaseProblem(version, sources);
    if (frozen) problems.push(frozen);
    const record = sources.record(version);
    const at = `releases/${version}.json`;
    if (!record) return { problems: [...problems, `no ${at} records the GitHub release the url names`] };
    problems.push(...releaseRecordProblems(record, version).map((problem) => `${at}: ${problem}`));
    const exe = record.artifacts?.exe;
    if (exe?.url !== target.url) problems.push(`${at} records the installer at ${JSON.stringify(exe?.url)}, not at the manifest's url`);
    if (exe?.signature !== target.signature) problems.push(`${at} records another signature than the manifest carries`);
    if (typeof exe?.blake2b512 !== "string" || !/^[0-9a-f]{128}$/.test(exe.blake2b512)) {
      return { problems: [...problems, `${at} states no BLAKE2b-512 digest to check the signature against`] };
    }
    return { problems, digest: Buffer.from(exe.blake2b512, "hex") };
  }
  const urlProblem = updaterUrlProblem(target.url, version);
  if (urlProblem) problems.push(urlProblem);
  if (hostOf(target.url) !== BLOB_HOST) problems.push(`the url ${target.url} is on neither github.com nor the Blob host ${BLOB_HOST}`);
  const legacy = legacyHostProblem(version, sources);
  if (legacy) problems.push(`the url ${target.url} is not on github.com, and ${legacy}`);
  const file = sources.installer(version);
  if (!file) return { problems: [...problems, `public/downloads/${ASSET_NAME.exe(version)}, the installer the url names, is missing`] };
  return { problems, digest: createHash("blake2b512").update(file).digest() };
}

/**
 * What the Windows updater would refuse in this manifest, given `sources`,
 * which finds a release's installer bytes (installer(version), a Buffer) and
 * its record (record(version)). It deserializes the whole manifest before it
 * picks its own platform (the RemoteRelease deserializer in
 * tauri-plugin-updater 2.10.1): every platform entry must be an object with a
 * parseable url and a string signature, or no platform updates. Publication
 * asks a little more than the reader: notes and pub_date are present strings,
 * and version is a bare SemVer core, three parts with no leading zero, each
 * within u64, and no prerelease or build suffix.
 */
function windowsUpdateProblems(manifest, sources, pubkey) {
  const problems = [];
  const { version, notes, pub_date: date, platforms } = manifest;
  const semverCore =
    typeof version === "string" &&
    /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(version) &&
    version.split(".").every((part) => BigInt(part) <= 2n ** 64n - 1n);
  if (!semverCore) problems.push(`version ${JSON.stringify(version)} is not a SemVer core`);
  if (typeof notes !== "string") problems.push(`notes ${JSON.stringify(notes)} is not a string`);
  const dateProblem = rfc3339Problem(date);
  if (dateProblem) problems.push(dateProblem);
  if (!platforms || typeof platforms !== "object" || Array.isArray(platforms)) return [...problems, "platforms is not an object"];
  for (const [name, entry] of Object.entries(platforms)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`platform ${name} is not an object`);
      continue;
    }
    if (typeof entry.url !== "string" || !URL.canParse(entry.url)) problems.push(`platform ${name}: url ${JSON.stringify(entry.url)} does not parse`);
    if (typeof entry.signature !== "string") problems.push(`platform ${name}: signature is not a string`);
  }
  const target = platforms["windows-x86_64"];
  if (!target || typeof target !== "object") return [...problems, "no windows-x86_64 platform"];
  const { problems: sourceProblems, digest } = installerDigest(target, version, sources);
  problems.push(...sourceProblems);
  if (!digest) return problems;
  const { problems: signatureProblems, trusted } = updaterSignatureProblems(digest, target.signature, pubkey);
  problems.push(...signatureProblems);
  if (!trusted?.split("\t").includes(`file:Koegaki_${version}_x64-setup.exe`)) {
    problems.push(`the trusted comment ${JSON.stringify(trusted)} does not name Koegaki_${version}_x64-setup.exe`);
  }
  return problems;
}

/**
 * What the Linux updater would refuse in `feed`, or what publication asks
 * beyond it (Koegaki spec 2026-10-13-linux-updater, rules 1 and 11), given
 * `record`, the release record of the feed's version, `pubkey`, the key the
 * Linux build checks a deb against, and `windowsFeed`, the Windows feed, whose
 * notes the Linux feed's equal when both offer the same version. The shape is the Windows
 * feed's, which the updater deserializes whole before it picks its platform
 * (see windowsUpdateProblems): version a bare SemVer core, notes and pub_date
 * present, every platform an object with a parseable url and a string
 * signature. Its one platform is linux-x86_64, the key every x86_64 Linux build
 * reads (after linux-x86_64-deb, which would shadow it for a deb install, so it
 * must not be there). Its url is the record's deb url, a GitHub release asset,
 * and its signature is the record's deb signature, verifying over the record's
 * BLAKE2b-512 digest with `pubkey` and naming the file the bundler wrote.
 */
function linuxUpdateProblems(feed, record, pubkey, windowsFeed) {
  if (!isPlainObject(feed)) return ["the feed is not an object"];
  const problems = [];
  // The updater reads url, signature and name (an alias of version) at the
  // top level too, and refuses a feed whose values it cannot read, so the
  // static feed holds its four fields and nothing else (review on the pull
  // request).
  const fields = Object.keys(feed).sort();
  if (fields.join() !== "notes,platforms,pub_date,version") {
    problems.push(`the feed holds ${JSON.stringify(fields)}, not version, notes, pub_date and platforms alone`);
  }
  const { version, notes, pub_date: date, platforms } = feed;
  // A release that ships on Windows and Linux tells both the same thing.
  if (isPlainObject(windowsFeed) && windowsFeed.version === version && windowsFeed.notes !== notes) {
    problems.push(`the notes are not the Windows feed's, which offers the same version ${version}`);
  }
  const semverCore =
    typeof version === "string" &&
    /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(version) &&
    version.split(".").every((part) => BigInt(part) <= 2n ** 64n - 1n);
  if (!semverCore) problems.push(`version ${JSON.stringify(version)} is not a SemVer core`);
  if (typeof notes !== "string") problems.push(`notes ${JSON.stringify(notes)} is not a string`);
  const dateProblem = rfc3339Problem(date);
  if (dateProblem) problems.push(dateProblem);
  if (!isPlainObject(platforms)) return [...problems, "platforms is not an object"];
  for (const [name, entry] of Object.entries(platforms)) {
    if (!isPlainObject(entry)) {
      problems.push(`platform ${name} is not an object`);
      continue;
    }
    if (typeof entry.url !== "string" || !URL.canParse(entry.url)) problems.push(`platform ${name}: url ${JSON.stringify(entry.url)} does not parse`);
    if (typeof entry.signature !== "string") problems.push(`platform ${name}: signature is not a string`);
  }
  const names = Object.keys(platforms);
  if (names.length !== 1 || names[0] !== "linux-x86_64") problems.push(`the platforms are ${JSON.stringify(names)}, not linux-x86_64 alone`);
  const target = platforms["linux-x86_64"];
  if (!isPlainObject(target)) return [...problems, "no linux-x86_64 platform"];
  if (!semverCore) return problems;
  const at = `releases/${version}.json`;
  if (!record) return [...problems, `no ${at} records the release the feed offers`];
  problems.push(...releaseRecordProblems(record, version).map((problem) => `${at}: ${problem}`));
  const deb = record.artifacts?.deb;
  if (!isPlainObject(deb)) return [...problems, `${at} records no deb`];
  if (target.url !== deb.url) problems.push(`the url ${JSON.stringify(target.url)} is not the deb url ${at} records`);
  if (target.signature !== deb.signature) problems.push(`the feed carries another signature than ${at} records`);
  if (typeof deb.blake2b512 !== "string" || !/^[0-9a-f]{128}$/.test(deb.blake2b512)) {
    return [...problems, `${at} states no BLAKE2b-512 digest to check the signature against`];
  }
  const { problems: signatureProblems, trusted } = updaterSignatureProblems(Buffer.from(deb.blake2b512, "hex"), target.signature, pubkey, "deb");
  problems.push(...signatureProblems);
  if (!trusted?.split("\t").includes(`file:${bundlerDebName(version)}`)) {
    problems.push(`the trusted comment ${JSON.stringify(trusted)} does not name ${bundlerDebName(version)}`);
  }
  return problems;
}

/** Where the release checks find a release's bytes: the installer in public/downloads, and its record in releases/. */
const RELEASE_SOURCES = {
  installer(version) {
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return undefined;
    const file = new URL(`../public/downloads/${ASSET_NAME.exe(version)}`, import.meta.url);
    return existsSync(file) ? readFileSync(file) : undefined;
  },
  record: releaseRecord,
};

/**
 * The release the updater manifest check is tried against, whatever the site
 * serves now: 1.9.0, as its manifest was published (its installer on Blob,
 * shipped from public/downloads) with notes and a date from the live manifest.
 * Its installer is still in public/downloads and releases/1.9.0.json records it,
 * so both ways of knowing an installer's bytes can be exercised.
 */
function updaterSelfTestRelease() {
  const version = "1.9.0";
  const record = releaseRecord(version);
  assert.ok(record, `releases/${version}.json, the record the updater checks are tried against, is missing`);
  const installer = RELEASE_SOURCES.installer(version);
  assert.ok(installer, `public/downloads/${ASSET_NAME.exe(version)}, the installer the updater checks are tried against, is missing`);
  const manifest = structuredClone(publicJson("windows-updates.json"));
  manifest.version = version;
  manifest.platforms = {
    "windows-x86_64": {
      signature: record.artifacts.exe.signature,
      url: `https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/${ASSET_NAME.exe(version)}`,
    },
  };
  return { manifest, installer, record };
}

test("the Windows updater manifest names the installer its signature covers", () => {
  // The site's own download link serves the same release the updater offers,
  // and once it moves to GitHub, the same release asset (liveManifestProblems).
  assert.deepEqual(liveManifestProblems(publicJson("windows-updates.json"), SITE.windowsDownloadUrl, RELEASE_SOURCES), []);
});

test("the updater manifest check refuses a damaged manifest, signature, installer or key", () => {
  const { manifest, installer, record } = updaterSelfTestRelease();
  const { signature, url } = manifest.platforms["windows-x86_64"];
  const { version } = manifest;
  // A release that is not the one published, derived from it so every release
  // has one: the same version with its patch part one higher.
  const otherRelease = version.split(".").map((part, i) => (i === 2 ? String(BigInt(part) + 1n) : part)).join(".");
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const decoded = (b64) => Buffer.from(b64, "base64").toString("utf8").split("\n");
  const encoded = (lines, end = "\n") => Buffer.from(lines.join(end)).toString("base64");
  // Rewrite one line of the signature text, re-encoded as the manifest carries it.
  const withLine = (n, change) => {
    const lines = decoded(signature);
    lines[n] = change(lines[n]);
    return encoded(lines);
  };
  const flipByte = (b64, at) => {
    const bytes = Buffer.from(b64, "base64");
    bytes[at] ^= 0x01;
    return bytes.toString("base64");
  };
  const flipped = (bytes, at) => {
    const copy = Buffer.from(bytes);
    copy[at] ^= 0x01;
    return copy;
  };
  const keyLines = decoded(WINDOWS_UPDATER_PUBKEY);
  // A case names `file` or `record` to change what the sources find, undefined
  // for none; otherwise they find the release's own installer and record.
  const check = (change) => {
    const { sig = signature, href = url, date, release = version, key = WINDOWS_UPDATER_PUBKEY, edit } = change;
    const file = "file" in change ? change.file : installer;
    const recorded = "record" in change ? change.record : record;
    const copy = structuredClone(manifest);
    Object.assign(copy.platforms["windows-x86_64"], { signature: sig, url: href });
    copy.version = release;
    if (date !== undefined) copy.pub_date = date;
    edit?.(copy);
    return windowsUpdateProblems(copy, { installer: () => file, record: () => recorded }, key);
  };
  // The same installer as a GitHub release asset, and its record changed one
  // way. A release on GitHub has no installer in public/downloads, so those
  // cases find none there.
  const githubUrl = githubAssetUrl(version, "exe");
  const notGithubUrl = new RegExp(`the url .* is not ${escaped(githubUrl)}`);
  const recordWith = (change) => {
    const copy = structuredClone(record);
    change(copy);
    return copy;
  };
  // The signature text with its first byte made invalid UTF-8, re-encoded canonically.
  const notUtf8 = (() => {
    const bytes = Buffer.from(signature, "base64");
    bytes[0] = 0xff;
    return bytes.toString("base64");
  })();
  const refused = [
    ["one signature byte", { sig: withLine(1, (l) => flipByte(l, 40)) }, /installer signature does not verify/],
    ["one installer byte", { file: flipped(installer, Math.floor(installer.length / 2)) }, /installer signature does not verify/],
    ["the signed file name", { sig: withLine(2, (l) => l.replace(/file:\S+/, `file:Koegaki_${otherRelease}_x64-setup.exe`)) }, /trusted comment signature does not verify/],
    ["the key id", { sig: withLine(1, (l) => flipByte(l, 2)) }, /key ids differ/],
    ["a release the trusted comment does not name", { release: otherRelease }, new RegExp(`does not name Koegaki_${escaped(otherRelease)}_x64-setup\\.exe`)],
    ["a character after the signature", { sig: `${signature}!` }, /signature is not canonical base64/],
    ["a character after the signature line", { sig: withLine(1, (l) => `${l}!`) }, /signature line is not canonical base64/],
    ["a character after the trusted comment signature line", { sig: withLine(3, (l) => `${l}!`) }, /trusted comment signature line is not canonical base64/],
    ["a character after the key", { key: `${WINDOWS_UPDATER_PUBKEY}!` }, /key is not canonical base64/],
    ["a character after the key line", { key: encoded(keyLines.map((l, i) => (i === 1 ? `${l}!` : l))) }, /key line is not canonical base64/],
    ["a url with no host", { href: `https://?/Koegaki-${version}-setup.exe` }, /url/],
    ["a url on a host that is neither GitHub nor the Blob", { href: url.replace(BLOB_HOST, "github.invalid") }, /is on neither github\.com nor the Blob host/],
    ["a url on koegaki.com", { href: `https://koegaki.com/Koegaki-${version}-setup.exe` }, /is on neither github\.com nor the Blob host/],
    ["a Blob url on another port", { href: url.replace(BLOB_HOST, `${BLOB_HOST}:444`) }, /is on neither github\.com nor the Blob host/],
    ["a url whose fragment names the installer", { href: `https://example.com/wrong.exe#/Koegaki-${version}-setup.exe` }, /url/],
    ["a url with a query", { href: `${url}?v=1` }, /url/],
    ["a url over http", { href: url.replace(/^https:/, "http:") }, /url/],
    ["a url with a user", { href: url.replace("https://", "https://someone@") }, /url/],
    ["a day February does not have", { date: "2026-02-30T15:26:44Z" }, /pub_date/],
    ["an hour the day does not have", { date: "2026-10-03T25:26:44Z" }, /pub_date/],
    ["a signature text that is not UTF-8", { sig: notUtf8 }, /signature is not UTF-8/],
    ["notes that are not a string", { edit: (m) => (m.notes = 123) }, /notes/],
    ["platforms that are not an object", { edit: (m) => (m.platforms = [m.platforms["windows-x86_64"]]) }, /platforms is not an object/],
    ["another platform with a numeric signature", { edit: (m) => (m.platforms["darwin-aarch64"] = { url: "broken", signature: 42 }) }, /darwin-aarch64: signature is not a string/],
    ["another platform whose url does not parse", { edit: (m) => (m.platforms["darwin-aarch64"] = { url: "broken", signature: "x" }) }, /darwin-aarch64: url/],
    ["another platform that is not an object", { edit: (m) => (m.platforms["darwin-aarch64"] = "x") }, /darwin-aarch64 is not an object/],
    ["a version with a leading zero", { release: "01.7.0" }, /^version/],
    ["a version part above u64", { release: "18446744073709551616.7.0" }, /^version/],
    ["a prerelease version", { release: "1.7.0-beta.1" }, /^version/],
    ["a version with build metadata", { release: "1.7.0+22" }, /^version/],
    [
      "an installer missing from public/downloads, though a record of it exists",
      { file: undefined },
      new RegExp(`public/downloads/Koegaki-${escaped(version)}-setup\\.exe, the installer the url names, is missing`),
    ],
    [
      "a Blob url for a release published on GitHub",
      { file: undefined },
      new RegExp(`is not on github\\.com, and releases/${escaped(version)}\\.json records ${escaped(version)} as a GitHub release`),
    ],
    ["a GitHub url on another tag", { href: githubUrl.replace(`/v${version}/`, `/v${otherRelease}/`) }, notGithubUrl],
    ["a GitHub url in another repo", { href: githubUrl.replace("/koegaki-releases/", "/koegaki/") }, notGithubUrl],
    ["a GitHub url of another owner", { href: githubUrl.replace("/vishutdhar/", "/someone/") }, notGithubUrl],
    ["a GitHub url with another asset name", { href: githubUrl.replace(/[^/]+$/, `Koegaki_${version}_x64-setup.exe`) }, notGithubUrl],
    ["a GitHub url with a query", { href: `${githubUrl}?raw=1` }, notGithubUrl],
    ["a GitHub url over http", { href: githubUrl.replace(/^https:/, "http:") }, notGithubUrl],
    [
      "a GitHub url for a release public/downloads holds, though a record of it exists",
      { href: githubUrl },
      new RegExp(`Koegaki-${escaped(version)}-setup\\.exe is in public/downloads, so ${escaped(version)} shipped before releases moved to GitHub`),
    ],
    [
      "a GitHub url with no record",
      { href: githubUrl, file: undefined, record: undefined },
      new RegExp(`no releases/${escaped(version)}\\.json records the GitHub release`),
    ],
    [
      "a recorded digest one byte off",
      { href: githubUrl, file: undefined, record: recordWith((r) => (r.artifacts.exe.blake2b512 = flipped(Buffer.from(r.artifacts.exe.blake2b512, "hex"), 0).toString("hex"))) },
      /installer signature does not verify/,
    ],
    [
      "a recorded digest that is not lowercase hex",
      { href: githubUrl, file: undefined, record: recordWith((r) => (r.artifacts.exe.blake2b512 = r.artifacts.exe.blake2b512.toUpperCase())) },
      /releases\/.*: exe: blake2b512/,
    ],
    ["a record of another version", { href: githubUrl, file: undefined, record: recordWith((r) => (r.version = otherRelease)) }, /names version/],
    [
      "a record whose signature is not the manifest's",
      { href: githubUrl, file: undefined, record: recordWith((r) => (r.artifacts.exe.signature = encoded(decoded(signature), "\r\n"))) },
      /records another signature/,
    ],
    [
      "a record whose installer url is another release's",
      { href: githubUrl, file: undefined, record: recordWith((r) => (r.artifacts.exe.url = r.artifacts.exe.url.replace(`/v${version}/`, `/v${otherRelease}/`))) },
      /records the installer at/,
    ],
  ];
  const accepted = [
    ["the manifest as published", {}],
    ["the signature text with CRLF line ends", { sig: encoded(decoded(signature), "\r\n") }],
    ["a pub_date with an offset", { date: "2026-10-03T17:26:44+02:00" }],
    ["another well formed platform", { edit: (m) => (m.platforms["darwin-aarch64"] = { url: "https://example.com/Koegaki.app.tar.gz", signature: "x" }) }],
    ["the GitHub release url with its record, and no installer in public/downloads", { href: githubUrl, file: undefined }],
  ];
  const missed = refused.filter(([, change, expected]) => !check(change).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, change]) => [name, check(change)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
  // Versions the updater reads as SemVer cores; any other release fails on its
  // url and trusted comment, so only the version rule is asked here.
  const versionRefused = ["0.0.0", "1.7.0", "18446744073709551615.7.0"].filter((release) =>
    check({ release }).some((p) => p.startsWith("version")),
  );
  assert.deepEqual(versionRefused, [], "these versions were refused");
});

/**
 * What is wrong with the updater signature a release record of `version`
 * states: it does not verify over the installer digest the record states, with
 * the key every installed Windows build checks, or its trusted comment names
 * another file than that version's installer. A record of a Mac only release
 * states no installer, and so no signature.
 */
function recordSignatureProblems(record, version, linuxKey = linuxKeyFor(version)) {
  const problems = [];
  if (record.artifacts.exe) {
    const { blake2b512, signature } = record.artifacts.exe;
    const checked = updaterSignatureProblems(Buffer.from(blake2b512, "hex"), signature, WINDOWS_UPDATER_PUBKEY);
    problems.push(...checked.problems);
    if (!checked.trusted?.split("\t").includes(`file:Koegaki_${version}_x64-setup.exe`)) {
      problems.push(`the trusted comment ${JSON.stringify(checked.trusted)} names another file`);
    }
  }
  // The deb's signature is checked the same way, with the key the Linux build
  // trusts, and names the file the bundler wrote (the publishing tool signs it
  // under that name before renaming it).
  if (record.artifacts.deb) {
    const { blake2b512, signature } = record.artifacts.deb;
    const checked = updaterSignatureProblems(Buffer.from(blake2b512, "hex"), signature, linuxKey, "deb");
    problems.push(...checked.problems.map((problem) => `deb: ${problem}`));
    if (!checked.trusted?.split("\t").includes(`file:${bundlerDebName(version)}`)) {
      problems.push(`deb: the trusted comment ${JSON.stringify(checked.trusted)} names another file`);
    }
  }
  return problems;
}

test("every release record states the installer digest its updater signature covers", () => {
  // The record of a release served from GitHub is the only copy of its digests
  // in this repository, so a digest changed by one byte must fail here even
  // where no manifest offers that release.
  for (const { name, version, record } of releaseRecords()) {
    assert.deepEqual(releaseRecordProblems(record, version), [], `releases/${name}`);
    assert.deepEqual(recordSignatureProblems(record, version), [], `releases/${name}`);
  }
});

test("the record signature check refuses a digest or a version the signature does not cover, and passes a record with no installer", () => {
  const record = releaseRecord("1.9.0");
  assert.ok(record, "releases/1.9.0.json, the record these cases start from, is missing");
  const flippedHex = (text) => `${text[0] === "0" ? "1" : "0"}${text.slice(1)}`;
  const flippedDigest = structuredClone(record);
  flippedDigest.artifacts.exe.blake2b512 = flippedHex(record.artifacts.exe.blake2b512);
  // A deb beside the 1.9.0 installer, signed for 1.9.0 with LINUX_ONLY_KEY.
  const withDeb = (edit) => {
    const copy = structuredClone(record);
    copy.artifacts.deb = { ...structuredClone(LINUX_ONLY_RECORD.artifacts.deb), url: githubAssetUrl("1.9.0", "deb") };
    copy.artifacts.deb.signature = LINUX_ONLY_KEY.sign(Buffer.from(copy.artifacts.deb.blake2b512, "hex"), bundlerDebName("1.9.0"));
    edit?.(copy.artifacts.deb);
    return copy;
  };
  const linuxOnly = LINUX_ONLY_RECORD.version;
  const linuxOnlyWith = (edit) => {
    const copy = structuredClone(LINUX_ONLY_RECORD);
    edit(copy.artifacts.deb);
    return copy;
  };
  const key = LINUX_ONLY_KEY.pubkey;
  const refused = [
    ["an installer digest one bit off", [flippedDigest, "1.9.0", key], /^the installer signature does not verify$/],
    ["the record read as another version", [record, "1.9.1", key], /^the trusted comment .* names another file$/],
    ["a deb digest one bit off", [linuxOnlyWith((d) => (d.blake2b512 = flippedHex(d.blake2b512))), linuxOnly, key], /^deb: the deb signature does not verify$/],
    ["a Linux only record read as another version", [LINUX_ONLY_RECORD, "1.14.1", key], /^deb: the trusted comment .* names another file$/],
    ["a deb signed by a key the Linux build does not trust", [LINUX_ONLY_RECORD, linuxOnly, minisignKey().pubkey], /^deb: the key ids differ$/],
    ["a deb signed by a key the Linux build does not trust, read as the Linux build reads it", [LINUX_ONLY_RECORD, linuxOnly, LINUX_UPDATER_PUBKEY], /^deb: /],
    [
      "a deb signed under the installer's name",
      [linuxOnlyWith((d) => (d.signature = LINUX_ONLY_KEY.sign(Buffer.from(d.blake2b512, "hex"), `Koegaki_${linuxOnly}_x64-setup.exe`))), linuxOnly, key],
      /^deb: the trusted comment .* names another file$/,
    ],
    [
      "a deb signed under its published name, not the bundler's",
      [linuxOnlyWith((d) => (d.signature = LINUX_ONLY_KEY.sign(Buffer.from(d.blake2b512, "hex"), ASSET_NAME.deb(linuxOnly)))), linuxOnly, key],
      /^deb: the trusted comment .* names another file$/,
    ],
    ["a deb beside the installer with a digest one bit off", [withDeb((d) => (d.blake2b512 = flippedHex(d.blake2b512))), "1.9.0", key], /^deb: the deb signature does not verify$/],
    ["an installer signature carried as the deb's", [withDeb((d) => (d.signature = record.artifacts.exe.signature)), "1.9.0", key], /^deb: /],
  ];
  const accepted = [
    ["a record of a disk image and an installer", [record, "1.9.0", key]],
    ["a Mac only record, which states no installer and so no signature", [MAC_ONLY_RECORD, MAC_ONLY_RECORD.version, key]],
    ["a Linux only record, its deb signed for its version", [LINUX_ONLY_RECORD, linuxOnly, key]],
    ["a record of all three", [withDeb(), "1.9.0", key]],
  ];
  const missed = refused.filter(([, args, expected]) => !recordSignatureProblems(...args).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, args]) => [name, recordSignatureProblems(...args)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

/**
 * The build number, sparkle:version, of every Mac release the appcast has
 * offered, read from the history of public/appcast.xml. Sparkle offers an item
 * only when its build number is higher than the installed app's
 * CFBundleVersion, so a release whose build is not higher than the one before
 * it reaches nobody. A release that publishes public/appcast.xml adds its line
 * here; the test of the live appcast fails until it does.
 */
const MAC_BUILDS = new Map([
  ["1.0.1", 2],
  ["1.0.2", 3],
  ["1.0.3", 4],
  ["1.0.4", 5],
  ["1.0.5", 6],
  ["1.0.6", 7],
  ["1.0.7", 8],
  ["1.0.8", 9],
  ["1.0.9", 10],
  ["1.1.0", 13],
  ["1.2", 14],
  ["1.2.1", 15],
  ["1.2.2", 16],
  ["1.2.3", 17],
  ["1.3.0", 18],
  ["1.5.0", 19],
  ["1.5.1", 20],
  ["1.6.0", 21],
  ["1.7.0", 22],
  ["1.8.0", 23],
  ["1.8.1", 24],
  ["1.9.0", 25],
  ["1.9.1", 26],
  ["1.10.0", 27],
  ["1.11.0", 28],
  ["1.11.1", 29],
  ["1.12.0", 30],
  ["1.12.1", 31],
  ["1.12.2", 32],
  ["1.12.3", 33],
  ["1.13.0", 34],
  ["1.13.2", 35],
]);

/** Below zero, zero or above zero as version a is below, equal to or above b, part by part, a missing part counting as 0. */
function compareVersions(a, b) {
  const [x, y] = [a, b].map((version) => version.split(".").map(BigInt));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [p, q] = [x[i] ?? 0n, y[i] ?? 0n];
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** A refusal of something legal XML allows but a Sparkle feed never needs, told apart from a parse error. */
const feedRefusal = (message) => Object.assign(new Error(message), { refusal: true });

/**
 * An XML document as a tree of elements, each { name, uri, local,
 * attributes, text, children, comments }, read by a conformant parser (saxes)
 * with namespaces, so the checks see the elements, attribute values and text
 * an XML reader such as Sparkle's does: CDATA and character references read
 * as text, and each name with its namespace and its name as written. Throws on
 * any well formedness error, and on a DOCTYPE or a processing instruction,
 * which no feed needs and which Sparkle's reader treats in ways these checks
 * do not follow. An element's text is its own, so markup inside it is seen as
 * children, and a comment inside it is counted, rather than read past.
 */
function xmlTree(xml) {
  const parser = new SaxesParser({ xmlns: true });
  const root = { name: "", uri: "", local: "", attributes: [], text: "", children: [], comments: 0 };
  const open = [root];
  parser.on("doctype", () => {
    throw feedRefusal("holds a DOCTYPE, which a Sparkle feed never needs");
  });
  parser.on("processinginstruction", () => {
    throw feedRefusal("holds a processing instruction, which a Sparkle feed never needs");
  });
  parser.on("opentag", (tag) => {
    const attributes = Object.values(tag.attributes).map(({ name, uri, local, value }) => ({ name, uri, local, value }));
    const element = { name: tag.name, uri: tag.uri, local: tag.local, attributes, text: "", children: [], comments: 0 };
    open.at(-1).children.push(element);
    open.push(element);
  });
  parser.on("closetag", () => open.pop());
  parser.on("text", (text) => (open.at(-1).text += text));
  parser.on("cdata", (text) => (open.at(-1).text += text));
  // Foundation's reader, which Sparkle uses, counts a comment's text in its
  // element's string value.
  parser.on("comment", () => (open.at(-1).comments += 1));
  parser.write(xml).close();
  return root;
}

/** Every element under `element`, in document order. */
const descendants = (element) => element.children.flatMap((child) => [child, ...descendants(child)]);
/** The children of `element` named `local` in namespace `uri` ("" for none). */
const childrenNamed = (element, uri, local) => element.children.filter((child) => child.uri === uri && child.local === local);
/**
 * The name Sparkle 2.9.4 files an item's child or an enclosure's attribute
 * under (sparkleNamespacedNameOfNode in Sparkle/SUAppcast.m): "sparkle:" and
 * its local name when it is in Sparkle's namespace, whatever the prefix, and
 * otherwise its name as written, so a sparkle prefix bound elsewhere still
 * reads as Sparkle's.
 */
const sparkleName = (node) => (node.uri === SPARKLE_NS ? `sparkle:${node.local}` : node.name);
/** The namespace of every namespace declaration (xmlns and xmlns:<prefix>), which binds a prefix and is no attribute value Sparkle reads. */
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
/** The children of `element` Sparkle files under `name`. */
const sparkleChildren = (element, name) => element.children.filter((child) => sparkleName(child) === name);
/** The value of the attribute of `element` Sparkle files under `name`, or undefined. */
const sparkleAttribute = (element, name) => element.attributes.find((a) => sparkleName(a) === name)?.value;

/**
 * The items Sparkle reads, /rss/channel/item, each with what it says of its
 * short version (the version when it holds exactly one child Sparkle reads as
 * sparkle:shortVersionString, null otherwise; how many it holds; whether that
 * element holds markup or a comment), the same of its build number
 * (sparkle:version), and its enclosures, the children Sparkle reads as
 * enclosure, each with its url, its length, every value Sparkle reads as its
 * EdDSA signature, and whether it gives a version or a build number of its
 * own, as an attribute of that local name in any namespace, a namespace
 * declaration aside. `stray` counts every other element named enclosure in
 * the document, in any namespace. Throws when the appcast cannot be read (see
 * xmlTree).
 */
function appcastItems(xml) {
  const root = xmlTree(xml);
  const items = childrenNamed(root, "", "rss")
    .flatMap((rss) => childrenNamed(rss, "", "channel"))
    .flatMap((channel) => childrenNamed(channel, "", "item"))
    .map((item) => {
      const versions = sparkleChildren(item, "sparkle:shortVersionString");
      const [only] = versions.length === 1 ? versions : [];
      const builds = sparkleChildren(item, "sparkle:version");
      const [build] = builds.length === 1 ? builds : [];
      return {
        version: only ? only.text : null,
        versions: versions.length,
        markup: Boolean(only?.children.length || only?.comments),
        build: build ? build.text : null,
        builds: builds.length,
        buildMarkup: Boolean(build?.children.length || build?.comments),
        enclosures: sparkleChildren(item, "enclosure").map((enclosure) => ({
          versioned: enclosure.attributes.some((a) => a.uri !== XMLNS_NS && a.local === "shortVersionString"),
          built: enclosure.attributes.some((a) => a.uri !== XMLNS_NS && a.local === "version"),
          url: sparkleAttribute(enclosure, "url"),
          length: sparkleAttribute(enclosure, "length"),
          signatures: enclosure.attributes.filter((a) => sparkleName(a) === "sparkle:edSignature").map((a) => a.value),
        })),
      };
    });
  const read = items.reduce((count, item) => count + item.enclosures.length, 0);
  return { items, stray: descendants(root).filter((element) => element.local === "enclosure").length - read };
}

/** Every enclosure of these items, each with its item's short version. */
const enclosuresOf = (items) => items.flatMap(({ version, enclosures }) => enclosures.map((enclosure) => ({ ...enclosure, version })));

/**
 * What is wrong with an item's build number, the sparkle:version Sparkle
 * compares with the installed app's CFBundleVersion to decide whether the item
 * is an update: it is a positive integer with no leading zero, the build
 * `builds` lists for this release when it lists one, higher than every build
 * it lists for an earlier release and lower than every build it lists for a
 * later one.
 */
function buildNumberProblems(version, build, builds) {
  if (!/^[1-9][0-9]*$/.test(build) || !Number.isSafeInteger(Number(build))) {
    return [`the build number ${JSON.stringify(build)} is not a positive integer`];
  }
  const number = Number(build);
  const problems = [];
  const listed = builds.get(version);
  if (listed !== undefined && number !== listed) problems.push(`the build number ${number} is not ${listed}, the build MAC_BUILDS lists for ${version}`);
  // Only a plain version can be placed among the others; any other is refused
  // on its own.
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) return problems;
  for (const [release, other] of builds) {
    const order = compareVersions(release, version);
    if (order < 0 && number <= other) problems.push(`the build number ${number} is not higher than ${other}, the build of ${release}, an earlier release`);
    if (order > 0 && number >= other) problems.push(`the build number ${number} is not lower than ${other}, the build of ${release}, a later release`);
  }
  return problems;
}

/**
 * What is wrong with the disk images an appcast offers, given `sources` (see
 * windowsUpdateProblems) and `builds`, the build number of each release (see
 * MAC_BUILDS). The appcast must be well formed XML that holds only what a
 * Sparkle feed needs; every enclosure must sit in an item Sparkle reads, whose
 * one short version is plain text and is not overridden on the enclosure, and
 * whose one build number is plain text that buildNumberProblems accepts and is
 * not overridden on the enclosure either (Sparkle reads an enclosure's own
 * sparkle:version first). Every enclosure carries exactly one EdDSA signature
 * of 64 bytes as canonical base64, the shape Sparkle can check; the signature
 * itself is over the whole disk image, which is not here, so only the test
 * that downloads the release verifies it. An enclosure on github.com must be
 * exactly the release asset of that version, of a release that did not ship
 * from public/downloads, and the length Sparkle is told must be the size that
 * release's record states. An enclosure on the Blob host, as every one was
 * through 1.9.0, must be exactly https://<Blob host>/Koegaki-<version>.dmg, the
 * url every one of them had, and may name only a release with no record, or
 * one that shipped from public/downloads (see legacyHostProblem); any other
 * host is refused, so a misspelled host cannot skip these checks.
 */
function appcastProblems(xml, sources, builds = MAC_BUILDS) {
  const problems = [];
  let read;
  try {
    read = appcastItems(xml);
  } catch (error) {
    return [error.refusal ? `the appcast ${error.message}` : `the appcast is not well formed XML, so Sparkle cannot read it: ${error.message}`];
  }
  // Every enclosure in the file is one checked below, so none escapes the
  // checks by sitting anywhere but directly in an item.
  const { items, stray } = read;
  if (stray !== 0) problems.push(`${stray} enclosure${stray === 1 ? "" : "s"} outside the items the check reads`);
  // Every item's version is checked, an item without a disk image included,
  // since Sparkle shows that version too.
  for (const { version, versions, markup, build, builds: buildCount, buildMarkup, enclosures } of items) {
    const at = `item ${version}`;
    if (version === null) problems.push(`an item holds ${versions} short versions, not one`);
    else if (markup) problems.push(`${at}: its short version holds markup, not only text`);
    else if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`${at}: the short version ${JSON.stringify(version)} is not a plain version`);
    if (build === null) problems.push(`${at}: it holds ${buildCount} build numbers (sparkle:version), not one`);
    else if (buildMarkup) problems.push(`${at}: its build number holds markup, not only text`);
    else problems.push(...buildNumberProblems(version, build, builds).map((problem) => `${at}: ${problem}`));
    if (enclosures.length === 0) problems.push(`${at}: it offers no disk image, and every item in this feed must`);
  }
  for (const { version, versioned, built, url, length, signatures } of enclosuresOf(items)) {
    const at = `item ${version}`;
    if (versioned) problems.push(`${at}: the enclosure gives a short version on its enclosure, which Sparkle would show instead of the item's`);
    if (built) problems.push(`${at}: the enclosure gives a build number on its enclosure, which Sparkle reads instead of the item's`);
    if (signatures.length !== 1) problems.push(`${at}: the enclosure carries ${signatures.length} EdDSA signatures (sparkle:edSignature), not one`);
    else if (canonicalBase64(signatures[0])?.length !== 64) {
      problems.push(`${at}: the EdDSA signature ${JSON.stringify(signatures[0])} is not 64 bytes as canonical base64, the only signature Sparkle can check`);
    }
    const host = hostOf(url);
    if (host !== "github.com") {
      if (host !== BLOB_HOST) problems.push(`${at}: the enclosure url ${url} is on neither github.com nor the Blob host ${BLOB_HOST}`);
      else if (url !== `https://${BLOB_HOST}/${ASSET_NAME.dmg(version)}`) {
        problems.push(`${at}: the enclosure url ${url} is not https://${BLOB_HOST}/${ASSET_NAME.dmg(version)}, where the Blob host served the disk image of ${version}`);
      }
      // Neither the release the item offers nor one the url's file names may
      // be a release published on GitHub. A server decodes the path, so the
      // name is read decoded; a path that does not decode names nothing.
      const named = decodedPath(url)?.match(/\/Koegaki-(\d+\.\d+\.\d+)\.dmg$/)?.[1];
      for (const release of new Set([version, named])) {
        const legacy = release ? legacyHostProblem(release, sources) : undefined;
        if (legacy) problems.push(`${at}: the enclosure url ${url} is not on github.com, and ${legacy}`);
      }
      continue;
    }
    const asset = githubAssetUrl(version, "dmg");
    if (url !== asset) problems.push(`${at}: the enclosure url ${url} is not ${asset}, the GitHub release asset of ${version}`);
    const frozen = frozenReleaseProblem(version, sources);
    if (frozen) problems.push(`${at}: ${frozen}`);
    const record = sources.record(version);
    if (!record) {
      problems.push(`${at}: no releases/${version}.json records the GitHub release the enclosure names`);
      continue;
    }
    problems.push(...releaseRecordProblems(record, version).map((problem) => `${at}: releases/${version}.json: ${problem}`));
    const dmg = record.artifacts?.dmg;
    if (dmg?.url !== url) problems.push(`${at}: releases/${version}.json records the disk image at ${JSON.stringify(dmg?.url)}, not at the enclosure url`);
    if (!/^[1-9][0-9]*$/.test(length ?? "") || Number(length) !== dmg?.size) {
      problems.push(`${at}: the enclosure length ${JSON.stringify(length)} is not ${dmg?.size}, the size releases/${version}.json records`);
    }
  }
  return problems;
}

/** The EdDSA signature the appcast carried for the 1.9.0 disk image, a real one to build test feeds with. */
const SIGNATURE_1_9_0 = "P9sOI9lFDNNgn0KabhORO522YuO5qGTLNvEJbmUuzCArQgyCa+f3phDKLhOhSHmFZZ39SrSjUpnkx7U/U47gDg==";

/**
 * An appcast of one item, laid out as Tools/make-appcast.sh writes it, with
 * the build number MAC_BUILDS lists for the version and 1.9.0's signature
 * unless `build` or `signature` says otherwise; null leaves either out.
 */
const appcastOf = (version, url, length, { build = MAC_BUILDS.get(version), signature = SIGNATURE_1_9_0 } = {}) => `<?xml version="1.0" standalone="yes"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
    <channel>
        <title>KoegakiMac</title>
        <item>
            <title>${version}</title>${build === null ? "" : `
            <sparkle:version>${build}</sparkle:version>`}
            <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
            <enclosure url="${url}" length="${length}" type="application/octet-stream"${signature === null ? "" : ` sparkle:edSignature="${signature}"`}/>
        </item>
    </channel>
</rss>
`;

test("the appcast offers a GitHub hosted disk image only at its release asset url, with the size its record states", () => {
  // The check holds a listed release to its build exactly, so every release the
  // appcast offers must be listed in MAC_BUILDS, and the site's Mac download
  // link, once it moves to GitHub, is the same asset (liveAppcastProblems).
  const xml = readFileSync(new URL("../public/appcast.xml", import.meta.url), "utf8");
  assert.deepEqual(liveAppcastProblems(xml, SITE.downloadUrl, RELEASE_SOURCES), []);
});

test("MAC_BUILDS lists the Mac releases in order, their build numbers rising with their versions", () => {
  const releases = [...MAC_BUILDS];
  for (const [i, [version, build]] of releases.entries()) {
    assert.match(version, /^\d+(?:\.\d+){1,2}$/, `MAC_BUILDS lists ${JSON.stringify(version)}, which is not a version`);
    assert.ok(Number.isSafeInteger(build) && build > 0, `MAC_BUILDS lists ${JSON.stringify(build)} for ${version}, which is not a positive integer`);
    if (i === 0) continue;
    const [before, beforeBuild] = releases[i - 1];
    assert.ok(compareVersions(before, version) < 0, `MAC_BUILDS lists ${before} before ${version}`);
    assert.ok(beforeBuild < build, `MAC_BUILDS lists build ${build} for ${version}, not higher than ${beforeBuild} for ${before}`);
  }
});

test("the appcast check refuses a GitHub enclosure at another url, of another size, or with no record", () => {
  const version = "1.9.0";
  const record = releaseRecord(version);
  assert.ok(record, `releases/${version}.json, the record the appcast checks are tried against, is missing`);
  const { size } = record.artifacts.dmg;
  const github = githubAssetUrl(version, "dmg");
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const notGithub = new RegExp(`enclosure url .* is not ${escaped(github)}`);
  const recordWith = (change) => {
    const copy = structuredClone(record);
    change(copy);
    return copy;
  };
  // A release on GitHub has no installer in public/downloads, so the sources
  // find none there unless a case names `file`.
  const check = (change) => {
    const { url = github, length = size, file, builds, xml = appcastOf(version, url, length) } = change;
    const recorded = "record" in change ? change.record : record;
    return appcastProblems(xml, change.sources ?? { installer: () => file, record: () => recorded }, builds);
  };
  // A build table of its own for the cases that need releases around this one,
  // so they hold whatever ships next.
  const listed = new Map([["1.9.0", 25], ["1.9.1", 26]]);
  const blob = (release) => `https://${BLOB_HOST}/Koegaki-${release}.dmg`;
  const withBuild = (text) => appcastOf(version, github, size).replace("<sparkle:version>25<", `<sparkle:version>${text}<`);
  // A second item, newer and broken, beside the good one.
  const withSecondItem = (open, enclosure) =>
    appcastOf(version, github, size).replace(
      "    </channel>",
      `        ${open}\n            <sparkle:shortVersionString>1.9.1</sparkle:shortVersionString>\n            ${enclosure}\n        </item>\n    </channel>`,
    );
  const brokenEnclosure = '<enclosure url="https://github.invalid/Koegaki-1.9.1.dmg" length="1" type="application/octet-stream"/>';
  const refused = [
    ["another tag", { url: github.replace(`/v${version}/`, "/v1.9.1/") }, notGithub],
    ["another repo", { url: github.replace("/koegaki-releases/", "/koegaki/") }, notGithub],
    ["another owner", { url: github.replace("/vishutdhar/", "/someone/") }, notGithub],
    ["another asset name", { url: github.replace(/[^/]+$/, "Koegaki.dmg") }, notGithub],
    ["the Windows installer's asset", { url: githubAssetUrl(version, "exe") }, notGithub],
    ["a query", { url: `${github}?raw=1` }, notGithub],
    ["a misspelled GitHub host", { url: github.replace("//github.com/", "//githb.com/"), record: undefined }, /is on neither github\.com nor the Blob host/],
    ["a newer item with an attribute on its tag", { xml: withSecondItem('<item xml:lang="en">', brokenEnclosure) }, /item 1\.9\.1: the enclosure url https:\/\/github\.invalid/],
    [
      "an attribute value that holds the release url, beside another url",
      { xml: appcastOf(version, "https://github.invalid/Koegaki-1.9.0.dmg", size).replace("<enclosure ", `<enclosure note=' url="${github}"' `) },
      /the enclosure url https:\/\/github\.invalid\/Koegaki-1\.9\.0\.dmg is on neither/,
    ],
    ["the url given twice", { xml: appcastOf(version, github, size).replace("<enclosure ", `<enclosure url="${github}" `) }, /not well formed XML/],
    ["an appcast that is not well formed", { xml: appcastOf(version, github, size).replace("</rss>", "") }, /not well formed XML/],
    [
      "a newer item hidden between comment markers inside CDATA",
      {
        xml: appcastOf(version, github, size)
          .replace("        </item>", "            <description><![CDATA[<!--]]></description>\n        </item>")
          .replace(
            "    </channel>",
            '        <item>\n            <sparkle:shortVersionString>1.9.2</sparkle:shortVersionString>\n            <enclosure url="https://github.invalid/Koegaki-1.9.2.dmg" length="1"/>\n            <description><![CDATA[-->]]></description>\n        </item>\n    </channel>',
          ),
      },
      /item 1\.9\.2: the enclosure url https:\/\/github\.invalid/,
    ],
    [
      "a version split across a CDATA section",
      { xml: appcastOf(version, github, size).replace(`<sparkle:shortVersionString>${version}<`, `<sparkle:shortVersionString>${version}<![CDATA[9]]><`) },
      new RegExp(`GitHub release asset of ${escaped(version)}9`),
    ],
    [
      "a version holding an element",
      { xml: appcastOf(version, github, size).replace(`<sparkle:shortVersionString>${version}<`, `<sparkle:shortVersionString>${version}<b>9</b><`) },
      /short version holds markup/,
    ],
    [
      // Foundation's XML reader, which Sparkle uses, includes a comment's text in
      // the element's string value, so this reads as 1.9.09 there.
      "a comment inside the version",
      { xml: appcastOf(version, github, size).replace(`<sparkle:shortVersionString>${version}<`, `<sparkle:shortVersionString>${version}<!--9--><`) },
      /short version holds markup/,
    ],
    [
      "a second item with no enclosure and a comment in its version",
      {
        xml: appcastOf(version, github, size).replace(
          "    </channel>",
          "        <item>\n            <sparkle:shortVersionString>1.9.1<!--9--></sparkle:shortVersionString>\n            <link>https://koegaki.com/</link>\n        </item>\n    </channel>",
        ),
      },
      /item 1\.9\.1<!--9-->|short version holds markup/,
    ],
    [
      "a second item with no enclosure",
      {
        xml: appcastOf(version, github, size).replace(
          "    </channel>",
          "        <item>\n            <sparkle:shortVersionString>1.9.1</sparkle:shortVersionString>\n            <link>https://koegaki.com/</link>\n        </item>\n    </channel>",
        ),
      },
      /item 1\.9\.1: it offers no disk image/,
    ],
    [
      "a second version under another prefix for the same namespace",
      {
        xml: appcastOf(version, github, size).replace(
          "<sparkle:version>",
          `<s:shortVersionString xmlns:s="${SPARKLE_NS}" xml:lang="en">9.9.9</s:shortVersionString>\n            <sparkle:version>`,
        ),
      },
      /item holds 2 short versions/,
    ],
    [
      "a second version whose sparkle prefix is bound to another namespace",
      {
        xml: appcastOf(version, github, size).replace(
          "<sparkle:version>",
          '<sparkle:shortVersionString xmlns:sparkle="urn:example:other" xml:lang="en">9.9.9</sparkle:shortVersionString>\n            <sparkle:version>',
        ),
      },
      /item holds 2 short versions/,
    ],
    [
      "a second enclosure in a default namespace",
      { xml: appcastOf(version, github, size).replace("        </item>", '            <enclosure xmlns="urn:example:other" url="https://github.invalid/Koegaki-1.9.0.dmg" length="1"/>\n        </item>') },
      /the enclosure url https:\/\/github\.invalid\/Koegaki-1\.9\.0\.dmg is on neither/,
    ],
    [
      "a version with space around it",
      { xml: appcastOf(version, github, size).replace(`<sparkle:shortVersionString>${version}<`, `<sparkle:shortVersionString> ${version} <`) },
      /short version " 1\.9\.0 " is not a plain version/,
    ],
    ["a version given on the enclosure", { xml: appcastOf(version, github, size).replace("<enclosure ", '<enclosure sparkle:shortVersionString="9.9.9" ') }, /short version on its enclosure/],
    [
      "an item Sparkle never reads, wrapped inside the channel",
      { xml: appcastOf(version, github, size).replace("        <item>", "        <wrapper><item>").replace("        </item>", "        </item></wrapper>") },
      /enclosure outside the items the check reads/,
    ],
    ["a processing instruction in an item", { xml: appcastOf(version, github, size).replace("<enclosure ", "<?enclosure ignored?>\n            <enclosure ") }, /processing instruction/],
    ["a DOCTYPE", { xml: appcastOf(version, github, size).replace("<rss ", "<!DOCTYPE rss [nonsense]>\n<rss ") }, /DOCTYPE/],
    [
      "a second version whose tag holds a space",
      { xml: appcastOf(version, github, size).replace("<sparkle:version>", "<sparkle:shortVersionString >9.9.9</sparkle:shortVersionString>\n            <sparkle:version>") },
      /item holds 2 short versions/,
    ],
    ["a Blob url on another port", { url: `https://${BLOB_HOST}:444/Koegaki-${version}.dmg`, record: undefined }, /is on neither/],
    [
      "an item with two versions",
      { xml: appcastOf(version, github, size).replace("<sparkle:version>", "<sparkle:shortVersionString>1.9.1</sparkle:shortVersionString>\n            <sparkle:version>") },
      /item holds 2 short versions/,
    ],
    [
      "an enclosure outside any item",
      { xml: appcastOf(version, github, size).replace("    </channel>", `        ${brokenEnclosure}\n    </channel>`) },
      /enclosures? outside the items/,
    ],
    ["a Blob host one character off", { url: `https://npdal36mxz3kcwxv.public.blob.vercel-storage.co/Koegaki-${version}.dmg`, record: undefined }, /is on neither github\.com nor the Blob host/],
    ["a length one byte longer", { length: size + 1 }, /enclosure length/],
    ["a length that is not a whole number", { length: `${size}.0` }, /enclosure length/],
    ["no record", { record: undefined }, new RegExp(`no releases/${escaped(version)}\\.json records`)],
    ["a record of another version", { record: recordWith((r) => (r.version = "1.9.1")) }, /names version/],
    [
      "a release public/downloads holds, though a record of it exists",
      { file: Buffer.from("MZ") },
      new RegExp(`Koegaki-${escaped(version)}-setup\\.exe is in public/downloads, so ${escaped(version)} shipped before releases moved to GitHub`),
    ],
    ["a record of another disk image", { record: recordWith((r) => (r.artifacts.dmg.url = r.artifacts.dmg.url.replace(/[^/]+$/, "Koegaki.dmg"))) }, /records the disk image at/],
    ["a Blob enclosure for a release published on GitHub", { url: blob(version) }, /item 1\.9\.0: the enclosure url .* is not on github\.com, and releases\/1\.9\.0\.json records 1\.9\.0 as a GitHub release/],
    [
      "a Blob enclosure naming a release published on GitHub, in the item of one with no record",
      {
        xml: appcastOf("1.8.5", blob("1.9.1"), 1, { build: 24 }),
        builds: listed,
        sources: { installer: () => undefined, record: (release) => (release === "1.9.1" ? record : undefined) },
      },
      /item 1\.8\.5: the enclosure url .*Koegaki-1\.9\.1\.dmg is not on github\.com, and releases\/1\.9\.1\.json records 1\.9\.1 as a GitHub release/,
    ],
    [
      "a Blob enclosure whose percent encoded file name names a release published on GitHub, in the item of 1.9.0",
      {
        xml: appcastOf(version, `https://${BLOB_HOST}/Koegaki-%31.9.1%2Edmg`, 1),
        sources: { installer: (release) => (release === version ? Buffer.from("MZ") : undefined), record: (release) => (release === version || release === "1.9.1" ? record : undefined) },
      },
      /Koegaki-%31\.9\.1%2Edmg is not on github\.com, and releases\/1\.9\.1\.json records 1\.9\.1 as a GitHub release/,
    ],
    ["a record whose disk image size is one byte off", { record: recordWith((r) => (r.artifacts.dmg.size += 1)) }, /enclosure length/],
    [
      "a Blob enclosure that serves the Windows installer as the disk image",
      { url: `https://${BLOB_HOST}/Koegaki-${version}-setup.exe`, file: Buffer.from("MZ") },
      new RegExp(`the enclosure url .*-setup\\.exe is not https://${escaped(BLOB_HOST)}/Koegaki-1\\.9\\.0\\.dmg`),
    ],
    [
      "a Blob enclosure for another release's disk image",
      { xml: appcastOf("1.8.5", blob("1.8.4"), 1, { build: 24 }), record: undefined, builds: listed },
      /item 1\.8\.5: the enclosure url .*Koegaki-1\.8\.4\.dmg is not https:.*Koegaki-1\.8\.5\.dmg/,
    ],
    ["no build number", { xml: appcastOf(version, github, size, { build: null }) }, /item 1\.9\.0: it holds 0 build numbers/],
    ["two build numbers", { xml: appcastOf(version, github, size).replace("<sparkle:version>", "<sparkle:version>25</sparkle:version>\n            <sparkle:version>") }, /holds 2 build numbers/],
    [
      "a second build number under another prefix for the same namespace",
      { xml: appcastOf(version, github, size).replace("<sparkle:version>", `<s:version xmlns:s="${SPARKLE_NS}">99</s:version>\n            <sparkle:version>`) },
      /holds 2 build numbers/,
    ],
    ["a build number that is not a number", { xml: withBuild("twenty-five") }, /build number "twenty-five" is not a positive integer/],
    ["a build number with a fraction", { xml: withBuild("25.1") }, /build number "25\.1" is not a positive integer/],
    ["a build number of zero", { xml: withBuild("0") }, /build number "0" is not a positive integer/],
    ["a build number with a leading zero", { xml: withBuild("025") }, /build number "025" is not a positive integer/],
    ["a build number with space around it", { xml: withBuild(" 25 ") }, /build number " 25 " is not a positive integer/],
    // Foundation's reader counts the comment's text, so Sparkle reads 259.
    ["a comment inside the build number", { xml: withBuild("25<!--9-->") }, /build number holds markup/],
    ["a build number other than the one listed for the release", { xml: withBuild("26") }, /the build number 26 is not 25, the build MAC_BUILDS lists for 1\.9\.0/],
    [
      "a newer release whose build number is not higher than the one before it",
      { xml: appcastOf("1.9.2", blob("1.9.2"), 1, { build: 26 }), record: undefined, builds: listed },
      /item 1\.9\.2: the build number 26 is not higher than 26, the build of 1\.9\.1/,
    ],
    [
      "an older release whose build number is not lower than a later one",
      { xml: appcastOf("1.8.5", blob("1.8.5"), 1, { build: 25 }), record: undefined, builds: listed },
      /item 1\.8\.5: the build number 25 is not lower than 25, the build of 1\.9\.0/,
    ],
    ["a build number on the enclosure", { xml: appcastOf(version, github, size).replace("<enclosure ", '<enclosure sparkle:version="99" ') }, /build number on its enclosure/],
    ["no EdDSA signature", { xml: appcastOf(version, github, size, { signature: null }) }, /carries 0 EdDSA signatures/],
    ["an empty EdDSA signature", { xml: appcastOf(version, github, size, { signature: "" }) }, /EdDSA signature "" is not 64 bytes/],
    ["an EdDSA signature of 63 bytes", { xml: appcastOf(version, github, size, { signature: Buffer.alloc(63, 7).toString("base64") }) }, /EdDSA signature .* is not 64 bytes/],
    ["an EdDSA signature of 9 bytes", { xml: appcastOf(version, github, size, { signature: "c2lnbmF0dXJl" }) }, /EdDSA signature "c2lnbmF0dXJl" is not 64 bytes/],
    ["an EdDSA signature with its padding cut", { xml: appcastOf(version, github, size, { signature: SIGNATURE_1_9_0.slice(0, -2) }) }, /EdDSA signature .* is not 64 bytes/],
    ["an EdDSA signature with a character after it", { xml: appcastOf(version, github, size, { signature: `${SIGNATURE_1_9_0}!` }) }, /EdDSA signature .* is not 64 bytes/],
    [
      "a second EdDSA signature whose sparkle prefix is bound to another namespace",
      { xml: appcastOf(version, github, size).replace("<enclosure ", `<enclosure xmlns:sparkle="urn:example:other" xmlns:s="${SPARKLE_NS}" s:edSignature="${SIGNATURE_1_9_0}" `) },
      /carries 2 EdDSA signatures/,
    ],
  ];
  const accepted = [
    ["the release asset with its recorded size", {}],
    ["an item tag with an attribute", { xml: appcastOf(version, github, size).replace("<item>", '<item xml:lang="en">') }],
    ["a version written as CDATA", { xml: appcastOf(version, github, size).replace(`<sparkle:shortVersionString>${version}<`, `<sparkle:shortVersionString><![CDATA[${version}]]><`) }],
    [
      "a url and length written with character references",
      { url: github.replace("github.com", "github&#46;com"), length: `&#${String(size).charCodeAt(0)};${String(size).slice(1)}` },
    ],
    ["an item end tag with a space", { xml: appcastOf(version, github, size).replace("</item>", "</item >") }],
    [
      "the version under another prefix bound to the Sparkle namespace",
      {
        xml: appcastOf(version, github, size).replace(
          `<sparkle:shortVersionString>${version}</sparkle:shortVersionString>`,
          `<s:shortVersionString xmlns:s="${SPARKLE_NS}">${version}</s:shortVersionString>`,
        ),
      },
    ],
    ["a comment that mentions an enclosure", { xml: appcastOf(version, github, size).replace("    </channel>", '        <!-- Old syntax: <enclosure url="retired"/> -->\n    </channel>') }],
    [
      "release notes in CDATA that mention an enclosure and a version",
      {
        xml: appcastOf(version, github, size).replace(
          "<sparkle:version>",
          "<description><![CDATA[<p>Sparkle reads <enclosure url=\"x\"/> and <sparkle:shortVersionString>9.9.9</sparkle:shortVersionString>.</p>]]></description>\n            <sparkle:version>",
        ),
      },
    ],
    ["a Blob url of any length, with no record", { url: `https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/Koegaki-${version}.dmg`, length: 1, record: undefined }],
    ["a Blob enclosure for 1.9.0, which shipped from public/downloads, though a record of it exists", { url: blob(version), file: Buffer.from("MZ") }],
    ["a build number written as CDATA", { xml: withBuild("<![CDATA[25]]>") }],
    // A namespace declaration binds a prefix and gives Sparkle no value.
    ["a namespace prefix named version declared on the enclosure", { xml: appcastOf(version, github, size).replace("<enclosure ", '<enclosure xmlns:version="urn:example:other" ') }],
    ["a namespace prefix named shortVersionString declared on the enclosure", { xml: appcastOf(version, github, size).replace("<enclosure ", '<enclosure xmlns:shortVersionString="urn:example:other" ') }],
    ["the EdDSA signature under another prefix bound to the Sparkle namespace", { xml: appcastOf(version, github, size).replace("sparkle:edSignature=", `xmlns:s="${SPARKLE_NS}" s:edSignature=`) }],
    ["a newer release with a higher build number", { xml: appcastOf("1.9.2", blob("1.9.2"), 1, { build: 27 }), record: undefined, builds: listed }],
    ["an older release with a lower build number", { xml: appcastOf("1.8.5", blob("1.8.5"), 1, { build: 24 }), record: undefined, builds: listed }],
  ];
  const missed = refused.filter(([, change, expected]) => !check(change).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, change]) => [name, check(change)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

/**
 * The installers public/downloads serves, frozen. Through 1.9.0 each release
 * added one here; from 1.9.1 the installers are GitHub release assets and
 * nothing new lands in this folder. These stay served because winget manifests
 * (1.2.1, 1.4.0, 1.5.0, 1.5.1) and a third party collection point at them.
 */
const FROZEN_DOWNLOADS = [
  "Koegaki-1.2.1-setup.exe",
  "Koegaki-1.3.0-setup.exe",
  "Koegaki-1.4.0-setup.exe",
  "Koegaki-1.5.0-setup.exe",
  "Koegaki-1.5.1-setup.exe",
  "Koegaki-1.5.2-setup.exe",
  "Koegaki-1.6.0-setup.exe",
  "Koegaki-1.7.0-setup.exe",
  "Koegaki-1.7.1-setup.exe",
  "Koegaki-1.8.0-setup.exe",
  "Koegaki-1.8.1-setup.exe",
  "Koegaki-1.9.0-setup.exe",
];

test("public/downloads holds exactly the 12 installers published before GitHub releases, and nothing new", () => {
  assert.deepEqual(readdirSync(new URL("../public/downloads/", import.meta.url)).sort(), FROZEN_DOWNLOADS);
});

/** Whether this deployment serves a file at this path, which is in public/. */
const servedFromPublic = (pathname) => existsSync(new URL(`../public${pathname}`, import.meta.url));

/**
 * What is wrong with a download link of this kind ("dmg" or "exe"), given
 * `sources` (see windowsUpdateProblems) and `serves` (see servedFromPublic).
 * The link names a release by its file name and is exactly one of three urls
 * for it. On github.com it is that release's asset, of a release whose record
 * states an asset of this kind, since a release that shipped on one platform
 * only has none of the other, and that did not ship from public/downloads.
 * The hosts used before GitHub, as
 * https://koegaki.com/downloads/<file>, which this deployment must serve, or
 * https://<Blob host>/<file>, may name only a release with no record, or one
 * that shipped from public/downloads (see legacyHostProblem). From 1.9.1
 * public/downloads gains nothing, so a link left on koegaki.com when its
 * release moves to GitHub would serve a 404 there.
 */
function downloadLinkProblems(kind, link, sources, serves = servedFromPublic) {
  const at = `the link ${link}`;
  const file = typeof link === "string" && URL.canParse(link) ? new URL(link).pathname.split("/").at(-1) : undefined;
  const named = { dmg: /^Koegaki-(\d+\.\d+\.\d+)\.dmg$/, exe: /^Koegaki-(\d+\.\d+\.\d+)-setup\.exe$/, deb: /^Koegaki-(\d+\.\d+\.\d+)-amd64\.deb$/ };
  const version = file?.match(named[kind])?.[1];
  if (!version) return [`${at} names no ${ASSET_WORD[kind]} of a release`];
  const host = hostOf(link);
  const problems = [];
  if (host === "github.com") {
    const asset = githubAssetUrl(version, kind);
    if (link !== asset) problems.push(`${at} is not ${asset}, the GitHub release asset of ${version}`);
    const record = sources.record(version);
    if (!record) problems.push(`${at} is on GitHub but no releases/${version}.json records that release`);
    else if (!isPlainObject(record.artifacts?.[kind])) problems.push(`${at} is on GitHub but releases/${version}.json records no ${ASSET_WORD[kind]} of ${version}`);
    const frozen = frozenReleaseProblem(version, sources);
    if (frozen) problems.push(`${at}: ${frozen}`);
    return problems;
  }
  // Every deb was published as a GitHub release asset; no other host ever served one.
  if (kind === "deb") return [`${at} is on ${host}, but a deb package is served from github.com only`];
  const legacyUrls = new Map([
    ["koegaki.com", `https://koegaki.com/downloads/${ASSET_NAME[kind](version)}`],
    [BLOB_HOST, `https://${BLOB_HOST}/${ASSET_NAME[kind](version)}`],
  ]);
  const legacyUrl = legacyUrls.get(host);
  if (!legacyUrl) return [`${at} is on ${host}, which serves no release`];
  if (link !== legacyUrl) problems.push(`${at} is not ${legacyUrl}`);
  else if (host === "koegaki.com" && !serves(new URL(link).pathname)) problems.push(`${at} names no file in public/`);
  const legacy = legacyHostProblem(version, sources);
  if (legacy) problems.push(`${at} is not on github.com, and ${legacy}`);
  return problems;
}

/**
 * What is wrong with the update manifest the site serves, beside its Windows
 * download link: what the updater would refuse (windowsUpdateProblems), and a
 * link that does not name the release the manifest offers, or, on GitHub, is
 * not that release's asset of a recorded release published there whose record
 * states an installer.
 */
function liveManifestProblems(manifest, link, sources) {
  const problems = windowsUpdateProblems(manifest, sources, WINDOWS_UPDATER_PUBKEY);
  const { version } = manifest;
  if (typeof link !== "string" || !link.endsWith(`/Koegaki-${version}-setup.exe`)) {
    problems.push(`the Windows download link ${link} does not name ${version}, the release the manifest offers`);
  }
  if (hostOf(link) === "github.com") {
    const asset = githubAssetUrl(version, "exe");
    if (link !== asset) problems.push(`the Windows download link ${link} is not ${asset}, the GitHub release asset of ${version}`);
    const record = sources.record(version);
    if (!record) problems.push(`the Windows download link is on GitHub but no releases/${version}.json records ${version}`);
    else if (!isPlainObject(record.artifacts?.exe)) problems.push(`the Windows download link is on GitHub but releases/${version}.json records no installer of ${version}`);
    const frozen = frozenReleaseProblem(version, sources);
    if (frozen) problems.push(`the Windows download link names a GitHub release that does not exist: ${frozen}`);
  }
  return problems;
}

/**
 * What is wrong with the appcast the site serves, beside its Mac download
 * link: what appcastProblems refuses; an appcast that offers no disk image, or
 * an enclosure with no version, url or length; a release MAC_BUILDS does not
 * list, since publishing one adds its build there; and a Mac link that is not
 * the url of a disk image the appcast offers, or, on GitHub, is not of a
 * recorded release published there whose record states a disk image.
 * `builds` is as appcastProblems takes it.
 */
function liveAppcastProblems(xml, link, sources, builds = MAC_BUILDS) {
  const problems = appcastProblems(xml, sources, builds);
  let items;
  try {
    ({ items } = appcastItems(xml));
  } catch {
    // appcastProblems has said why the appcast cannot be read.
    return problems;
  }
  const enclosures = enclosuresOf(items);
  if (enclosures.length === 0) problems.push("the appcast offers no disk image");
  for (const { version, url, length } of enclosures) {
    if (!version || !url || !length) problems.push(`item ${version}: the enclosure gives no ${!url ? "url" : !length ? "length" : "version"}`);
  }
  for (const { version } of items) {
    if (!builds.has(version)) problems.push(`the appcast offers ${version}, for which MAC_BUILDS lists no build; add the build number that release published`);
  }
  // The Mac link serves the disk image the appcast offers, from the same url,
  // whichever host that is; appcastProblems holds that url to its release.
  const offered = enclosures.find((enclosure) => enclosure.url === link);
  if (!offered) {
    problems.push(`the Mac download link ${link} is not the url of a disk image the appcast offers`);
  } else if (hostOf(link) === "github.com") {
    const record = sources.record(offered.version);
    if (!record) problems.push(`the Mac download link is on GitHub but no releases/${offered.version}.json records ${offered.version}`);
    else if (!isPlainObject(record.artifacts?.dmg)) {
      problems.push(`the Mac download link is on GitHub but releases/${offered.version}.json records no disk image of ${offered.version}`);
    }
    const frozen = frozenReleaseProblem(offered.version, sources);
    if (frozen) problems.push(`the Mac download link names a GitHub release that does not exist: ${frozen}`);
  }
  return problems;
}

/** What is wrong with the site's download links, given as { dmg, exe } and, once Linux ships, deb. */
function liveLinkProblems(links, sources) {
  const platform = { dmg: "Mac", exe: "Windows", deb: "Linux" };
  return Object.entries(links).flatMap(([kind, link]) => downloadLinkProblems(kind, link, sources).map((problem) => `${platform[kind]}: ${problem}`));
}

/** Every problem with the files and links the site serves for its releases, as the tests of each check them. */
function liveReleaseProblems(manifest, xml, links, sources, builds = MAC_BUILDS) {
  return [
    ...liveManifestProblems(manifest, links.exe, sources).map((problem) => `public/windows-updates.json: ${problem}`),
    ...liveAppcastProblems(xml, links.dmg, sources, builds).map((problem) => `public/appcast.xml: ${problem}`),
    ...liveLinkProblems(links, sources).map((problem) => `download link: ${problem}`),
  ];
}

/** The site's download links, by kind; the Linux one only once a Linux release exists. */
const SITE_LINKS = { dmg: SITE.downloadUrl, exe: SITE.windowsDownloadUrl, ...(LINUX_ON ? { deb: SITE.linuxDownloadUrl } : {}) };

test("the live release checks refuse an appcast with no release, a link the feeds do not offer, and a release MAC_BUILDS does not list", () => {
  const manifest = publicJson("windows-updates.json");
  const xml = readFileSync(new URL("../public/appcast.xml", import.meta.url), "utf8");
  const { version } = manifest;
  const [item] = appcastItems(xml).items;
  assert.ok(item?.version, "the live appcast offers no release these cases can start from");
  const seed = releaseRecord("1.9.0");
  assert.ok(seed && RELEASE_SOURCES.installer("1.9.0"), "releases/1.9.0.json or its installer, which these cases use as an older release, is missing");
  // 1.9.0's appcast as it was served, from the Blob host.
  const appcast190 = appcastOf("1.9.0", `https://${BLOB_HOST}/Koegaki-1.9.0.dmg`, seed.artifacts.dmg.size);
  // A Mac only release, MAC_ONLY_RECORD, on the appcast and the Mac link, as
  // release day leaves them: the manifest and the Windows link stay where they
  // are. Its build is the one MAC_BUILDS lists once it ships, the next one
  // until then. Only the cases that name it read MAC_ONLY_RECORD, so the real
  // record of that release, once it lands, is what the live files are held to.
  const macOnlySources = withMacOnlyRelease(RELEASE_SOURCES);
  const macOnly = MAC_ONLY_RECORD.version;
  const macOnlyBuild = MAC_BUILDS.get(macOnly) ?? Math.max(...MAC_BUILDS.values()) + 1;
  const macOnlyBuilds = new Map([...MAC_BUILDS, [macOnly, macOnlyBuild]]);
  const macOnlyAppcast = appcastOf(macOnly, MAC_ONLY_RECORD.artifacts.dmg.url, MAC_ONLY_RECORD.artifacts.dmg.size, { build: macOnlyBuild });
  const macOnlyManifest = structuredClone(manifest);
  macOnlyManifest.version = macOnly;
  macOnlyManifest.platforms["windows-x86_64"].url = githubAssetUrl(macOnly, "exe");
  const check = ({ m = manifest, x = xml, links = {}, from = RELEASE_SOURCES, builds = MAC_BUILDS }) => liveReleaseProblems(m, x, { ...SITE_LINKS, ...links }, from, builds);
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refused = [
    ["an appcast whose channel is empty", { x: '<rss version="2.0"><channel/></rss>' }, /appcast\.xml: the appcast offers no disk image/],
    ["an appcast that is not a feed", { x: "<oops/>" }, /appcast\.xml: the appcast offers no disk image/],
    ["an appcast that does not parse", { x: "<rss>" }, /appcast\.xml: the appcast is not well formed XML/],
    [
      "a Windows link to 1.9.0 beside a manifest that offers another release",
      { links: { exe: "https://koegaki.com/downloads/Koegaki-1.9.0-setup.exe" } },
      new RegExp(`windows-updates\\.json: the Windows download link .* does not name ${escaped(version)}`),
    ],
    ["the 1.9.0 appcast beside a Mac link to a release on GitHub", { x: appcast190 }, /appcast\.xml: the Mac download link .* is not the url of a disk image the appcast offers/],
    ["a Mac link to 1.9.0 on the Blob host beside the appcast", { links: { dmg: `https://${BLOB_HOST}/Koegaki-1.9.0.dmg` } }, /appcast\.xml: the Mac download link .*Koegaki-1\.9\.0\.dmg is not the url of a disk image the appcast offers/],
    ["a Mac link on the Blob host to a release nobody published", { links: { dmg: `https://${BLOB_HOST}/Koegaki-9.9.9.dmg` } }, /appcast\.xml: the Mac download link .*Koegaki-9\.9\.9\.dmg is not the url of a disk image the appcast offers/],
    [
      "the 1.9.0 appcast with no enclosure length, beside its own Mac link",
      { x: appcast190.replace(/ length="\d+"/, ""), links: { dmg: `https://${BLOB_HOST}/Koegaki-1.9.0.dmg` } },
      /appcast\.xml: item 1\.9\.0: the enclosure gives no length/,
    ],
    ["a Windows link on a host that serves no release", { links: { exe: `https://example.com/Koegaki-${version}-setup.exe` } }, /download link: Windows: .* is on example\.com, which serves no release/],
    [
      "an appcast item MAC_BUILDS does not list",
      { x: xml.replaceAll(`>${item.version}<`, ">9.9.9<") },
      /appcast\.xml: the appcast offers 9\.9\.9, for which MAC_BUILDS lists no build/,
    ],
    [
      "a manifest and a Windows link offering a Mac only release",
      { m: macOnlyManifest, links: { exe: githubAssetUrl(macOnly, "exe") }, from: macOnlySources },
      new RegExp(`windows-updates\\.json: the Windows download link is on GitHub but releases/${escaped(macOnly)}\\.json records no installer of ${escaped(macOnly)}`),
    ],
    [
      "a Windows link to a Mac only release beside the manifest as published",
      { links: { exe: githubAssetUrl(macOnly, "exe") }, from: macOnlySources },
      new RegExp(`download link: Windows: .* is on GitHub but releases/${escaped(macOnly)}\\.json records no installer of ${escaped(macOnly)}`),
    ],
    [
      "the appcast and the Mac link as published, their release recorded as Windows only",
      { from: withoutArtifact(RELEASE_SOURCES, item.version, "dmg") },
      new RegExp(`appcast\\.xml: the Mac download link is on GitHub but releases/${escaped(item.version)}\\.json records no disk image of ${escaped(item.version)}`),
    ],
  ];
  const accepted = [
    ["the live files and links as published", {}],
    ["the 1.9.0 appcast beside its own Mac link on the Blob host, and the live manifest", { x: appcast190, links: { dmg: `https://${BLOB_HOST}/Koegaki-1.9.0.dmg` } }],
    [
      "a Mac only release on the appcast and the Mac link, beside the manifest and the Windows link as published",
      { x: macOnlyAppcast, links: { dmg: MAC_ONLY_RECORD.artifacts.dmg.url }, from: macOnlySources, builds: macOnlyBuilds },
    ],
  ];
  const missed = refused.filter(([, change, expected]) => !check(change).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, change]) => [name, check(change)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

test("every download link is a GitHub release asset, or names a release with no record on koegaki.com or the Blob host", () => {
  assert.deepEqual(liveLinkProblems(SITE_LINKS, RELEASE_SOURCES), []);
});

test("the download link check refuses a recorded release off GitHub, a link on any other host, and a link to no release", () => {
  // Three releases from the repository as it is: one published on GitHub for
  // both platforms, so recorded with both assets and no installer in
  // public/downloads; 1.9.0, recorded only for the self tests although
  // public/downloads holds it; and one public/downloads holds that no record
  // names. MAC_ONLY_RECORD stands for a release published for the Mac only.
  const versionOf = ({ version }) => version;
  const github = releaseRecords()
    .filter(({ version, record }) => version && !RELEASE_SOURCES.installer(version) && record?.artifacts?.dmg && record?.artifacts?.exe)
    .map(versionOf)
    .at(-1);
  const seed = releaseRecords().filter(({ version }) => version && RELEASE_SOURCES.installer(version)).map(versionOf).at(-1);
  const unrecorded = FROZEN_DOWNLOADS.map((name) => name.match(/^Koegaki-(\d+\.\d+\.\d+)-setup\.exe$/)[1]).filter((version) => !releaseRecord(version)).at(-1);
  assert.ok(github && seed && unrecorded, `the releases these cases need are missing: ${JSON.stringify({ github, seed, unrecorded })}`);
  const macOnly = MAC_ONLY_RECORD.version;
  const linuxOnly = LINUX_ONLY_RECORD.version;
  const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const offGithub = (release) => new RegExp(`records ${escaped(release)} as a GitHub release`);
  const blob = (kind, release) => `https://${BLOB_HOST}/${ASSET_NAME[kind](release)}`;
  const site = (release) => `https://koegaki.com/downloads/${ASSET_NAME.exe(release)}`;
  const refused = [
    ["a Mac link on the Blob host for a release published on GitHub", ["dmg", blob("dmg", github)], offGithub(github)],
    ["a Windows link on the Blob host for a release published on GitHub", ["exe", blob("exe", github)], offGithub(github)],
    ["a Windows link on koegaki.com for a release published on GitHub, though the file is served", ["exe", site(github), () => true], offGithub(github)],
    ["a Windows link on koegaki.com naming a file this deployment does not serve", ["exe", site("1.1.0")], /names no file in public\//],
    ["a link on another host", ["exe", `https://example.com/${ASSET_NAME.exe(unrecorded)}`], /is on example\.com, which serves no release/],
    ["a koegaki.com link outside downloads", ["exe", `https://koegaki.com/${ASSET_NAME.exe(unrecorded)}`, () => true], /is not https:\/\/koegaki\.com\/downloads\//],
    ["a Blob link over http", ["dmg", blob("dmg", unrecorded).replace(/^https:/, "http:")], /is not https:/],
    ["a link that names no release", ["dmg", `https://${BLOB_HOST}/Koegaki.dmg`], /names no disk image of a release/],
    ["a Mac link to an installer", ["dmg", githubAssetUrl(github, "exe")], /names no disk image of a release/],
    ["a GitHub link to a release with no record", ["dmg", githubAssetUrl("9.9.9", "dmg")], /no releases\/9\.9\.9\.json records/],
    ["a GitHub link to a release public/downloads holds", ["exe", githubAssetUrl(seed, "exe")], new RegExp(`${escaped(ASSET_NAME.exe(seed))} is in public/downloads`)],
    ["a GitHub link with a query", ["dmg", `${githubAssetUrl(github, "dmg")}?raw=1`], /is not https:\/\/github\.com\//],
    ["a GitHub link in another repo", ["dmg", githubAssetUrl(github, "dmg").replace("/koegaki-releases/", "/koegaki/")], /is not https:\/\/github\.com\//],
    ["a Windows link on GitHub to a Mac only release", ["exe", githubAssetUrl(macOnly, "exe")], new RegExp(`is on GitHub but releases/${escaped(macOnly)}\\.json records no installer of ${escaped(macOnly)}`)],
    [
      "a Mac link on GitHub to a release recorded as Windows only",
      ["dmg", githubAssetUrl(github, "dmg"), undefined, withoutArtifact(RELEASE_SOURCES, github, "dmg")],
      new RegExp(`is on GitHub but releases/${escaped(github)}\\.json records no disk image of ${escaped(github)}`),
    ],
    ["a Windows link on koegaki.com to a Mac only release, though the file is served", ["exe", site(macOnly), () => true], offGithub(macOnly)],
    // A deb was only ever a GitHub release asset, of a release whose record states one.
    ["a Linux link on koegaki.com, though the file is served", ["deb", `https://koegaki.com/downloads/${ASSET_NAME.deb(linuxOnly)}`, () => true], /is on koegaki\.com, but a deb package is served from github\.com only/],
    ["a Linux link on the Blob host", ["deb", `https://${BLOB_HOST}/${ASSET_NAME.deb(linuxOnly)}`], /is on npdal36mxz3kcwxv\.public\.blob\.vercel-storage\.com, but a deb package is served from github\.com only/],
    ["a Linux link to a release recorded without a deb", ["deb", githubAssetUrl(github, "deb")], new RegExp(`is on GitHub but releases/${escaped(github)}\\.json records no deb package of ${escaped(github)}`)],
    ["a Linux link to a release with no record", ["deb", githubAssetUrl("9.9.9", "deb")], /no releases\/9\.9\.9\.json records/],
    ["a Linux link that names no release", ["deb", `${GITHUB_DOWNLOAD}/v${linuxOnly}/Koegaki.deb`], /names no deb package of a release/],
    ["a Linux link to the bundler's file name", ["deb", `${GITHUB_DOWNLOAD}/v${linuxOnly}/${bundlerDebName(linuxOnly)}`], /names no deb package of a release/],
    ["a Linux link to an installer", ["deb", githubAssetUrl(linuxOnly, "exe")], /names no deb package of a release/],
    ["a Linux link with a query", ["deb", `${githubAssetUrl(linuxOnly, "deb")}?raw=1`], /is not https:\/\/github\.com\//],
    ["a Linux link on another tag", ["deb", githubAssetUrl(linuxOnly, "deb").replace(`/v${linuxOnly}/`, "/v1.13.1/")], /is not https:\/\/github\.com\//],
    ["a Linux link to a release public/downloads holds", ["deb", githubAssetUrl(seed, "deb")], new RegExp(`${escaped(ASSET_NAME.exe(seed))} is in public/downloads`)],
    ["a Mac link to a Linux only release", ["dmg", githubAssetUrl(linuxOnly, "dmg")], new RegExp(`records no disk image of ${escaped(linuxOnly)}`)],
    ["a Windows link to a Linux only release", ["exe", githubAssetUrl(linuxOnly, "exe")], new RegExp(`records no installer of ${escaped(linuxOnly)}`)],
  ];
  const accepted = [
    ["the GitHub disk image of a release published on GitHub", ["dmg", githubAssetUrl(github, "dmg")]],
    ["the GitHub installer of a release published on GitHub", ["exe", githubAssetUrl(github, "exe")]],
    ["the GitHub disk image of a Mac only release", ["dmg", githubAssetUrl(macOnly, "dmg")]],
    ["a Windows link on koegaki.com for 1.9.0, recorded only for the self tests", ["exe", site(seed)]],
    ["a Mac link on the Blob host for 1.9.0, recorded only for the self tests", ["dmg", blob("dmg", seed)]],
    ["a Windows link on koegaki.com for a release with no record", ["exe", site(unrecorded)]],
    ["a Mac link on the Blob host for a release with no record", ["dmg", blob("dmg", unrecorded)]],
    ["the GitHub deb of a Linux only release", ["deb", githubAssetUrl(linuxOnly, "deb")]],
  ];
  const check = ([kind, link, serves, sources = withLinuxOnlyRelease(withMacOnlyRelease(RELEASE_SOURCES))]) => downloadLinkProblems(kind, link, sources, serves);
  const missed = refused.filter(([, args, expected]) => !check(args).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, args]) => [name, check(args)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

/**
 * The key the Mac app checks every update against, copied from the Koegaki
 * repo (SUPublicEDKey in apps/KoegakiMac/project.yml and
 * apps/KoegakiMac/Resources/Info.plist): a raw 32 byte Ed25519 key as base64.
 * Sparkle verifies an enclosure's sparkle:edSignature over the whole disk
 * image with it before it opens the image.
 */
const MAC_SPARKLE_PUBKEY = "2SAX2B+giN1G9pZlqlTMOA/Es0PWh1wPj+M3Et6WZVw=";

/**
 * What differs between a release as downloaded and its record, which the
 * offline checks can hold only to its shape and to the signed installer
 * digest. `assets` holds the downloaded disk image and installer by kind
 * ("dmg", "exe"); each the record states must have been downloaded, with the
 * size, SHA-256 and BLAKE2b-512 the record states, so a release that shipped
 * on one platform only is held to its one asset. Where the record states an
 * installer, its updater signature, which the manifest must carry, must verify
 * over the downloaded installer and name its file; where it states a disk
 * image, every Sparkle signature in `signatures`, what the appcast gives for
 * it, must verify over the downloaded disk image; where it states a deb, its
 * updater signature must verify over the downloaded deb and name the file the
 * bundler wrote. `keys` holds the Windows updater's key (`updater`, as
 * WINDOWS_UPDATER_PUBKEY), Sparkle's (`sparkle`, as MAC_SPARKLE_PUBKEY) and
 * the Linux updater's (`linux`, as LINUX_UPDATER_PUBKEY).
 */
function downloadedReleaseProblems(record, assets, signatures, keys) {
  const problems = [];
  const kinds = recordedKinds(record);
  for (const kind of kinds) {
    const bytes = assets[kind];
    if (!bytes) problems.push(`${kind}: nothing was downloaded`);
    else problems.push(...assetBytesProblems(bytes, record.artifacts[kind], "the record").map((problem) => `${kind}: ${problem}`));
  }
  if (kinds.includes("exe") && assets.exe) {
    problems.push(...installerSignatureProblems(assets.exe, record.artifacts.exe.signature, record.version, keys.updater).map((problem) => `exe: ${problem}`));
  }
  if (kinds.includes("dmg") && assets.dmg) problems.push(...sparkleSignatureProblems(assets.dmg, signatures, keys.sparkle).map((problem) => `dmg: ${problem}`));
  if (kinds.includes("deb") && assets.deb) {
    problems.push(...debSignatureProblems(assets.deb, record.artifacts.deb.signature, record.version, keys.linux).map((problem) => `deb: ${problem}`));
  }
  return problems;
}

/**
 * What the Linux updater refuses in a downloaded deb of `version`:
 * `signature` does not verify over its BLAKE2b-512 digest with `key` (as
 * LINUX_UPDATER_PUBKEY), or its trusted comment names another file than the
 * one the bundler wrote for that version.
 */
function debSignatureProblems(bytes, signature, version, key) {
  const digest = createHash("blake2b512").update(bytes).digest();
  const { problems, trusted } = updaterSignatureProblems(digest, signature, key, "deb");
  if (!trusted?.split("\t").includes(`file:${bundlerDebName(version)}`)) {
    return [...problems, `the trusted comment ${JSON.stringify(trusted)} does not name ${bundlerDebName(version)}`];
  }
  return problems;
}

/**
 * What the test that downloads a release fetches for one record and holds the
 * downloads to: `urls`, the url of each asset the record states, by kind, so a
 * release that shipped on one platform only fetches its one asset;
 * `signatures`, the Sparkle signatures the appcast's `enclosures` give for its
 * disk image, if it has one; and `checked`, the record carrying, where the
 * manifest's `target` offers its installer, the signature the manifest
 * carries, which is what the updater checks.
 */
function releaseDownloads(record, target, enclosures) {
  const { dmg, exe } = record.artifacts;
  const urls = Object.fromEntries(recordedKinds(record).map((kind) => [kind, record.artifacts[kind].url]));
  const signatures = dmg ? enclosures.filter(({ url }) => url === dmg.url).flatMap((enclosure) => enclosure.signatures) : [];
  const checked = structuredClone(record);
  if (exe && target.url === exe.url) checked.artifacts.exe.signature = target.signature;
  return { urls, signatures, checked };
}

/** Where downloaded `bytes` differ from the size, SHA-256 and BLAKE2b-512 that `expected` gives, as `source` states them. */
function assetBytesProblems(bytes, expected, source) {
  const problems = [];
  if (bytes.length !== expected?.size) problems.push(`${bytes.length} bytes, not the ${expected?.size} ${source} states`);
  for (const digest of ["sha256", "blake2b512"]) {
    const actual = createHash(digest).update(bytes).digest("hex");
    if (actual !== expected?.[digest]) problems.push(`${digest} ${actual} is not ${expected?.[digest]}, the digest ${source} states`);
  }
  return problems;
}

/**
 * What the Windows updater refuses in a downloaded installer of `version`:
 * `signature` does not verify over its BLAKE2b-512 digest with `key` (as
 * WINDOWS_UPDATER_PUBKEY), or its trusted comment names another file.
 */
function installerSignatureProblems(bytes, signature, version, key) {
  const digest = createHash("blake2b512").update(bytes).digest();
  const { problems, trusted } = updaterSignatureProblems(digest, signature, key);
  if (!trusted?.split("\t").includes(`file:Koegaki_${version}_x64-setup.exe`)) {
    return [...problems, `the trusted comment ${JSON.stringify(trusted)} does not name Koegaki_${version}_x64-setup.exe`];
  }
  return problems;
}

/**
 * What is wrong with an installer of `version` as the update manifest or the
 * Windows download link serves it, from whichever host: its bytes are not the
 * release's, as its record states them, or for a release with no record as the
 * installer public/downloads holds (the bytes the offline checks hold the
 * manifest's signature to), or `signature`, the one the manifest carries, does
 * not verify over them with `key` (as WINDOWS_UPDATER_PUBKEY). `sources` is as
 * windowsUpdateProblems takes it.
 */
function servedInstallerProblems(bytes, version, signature, sources, key) {
  const record = sources.record(version);
  const file = record ? undefined : sources.installer(version);
  if (!record && !file) return [`neither releases/${version}.json nor public/downloads states the bytes of ${ASSET_NAME.exe(version)}`];
  const hex = (digest) => createHash(digest).update(file).digest("hex");
  const [expected, source] = record
    ? [record.artifacts?.exe, `releases/${version}.json`]
    : [{ size: file.length, sha256: hex("sha256"), blake2b512: hex("blake2b512") }, `public/downloads/${ASSET_NAME.exe(version)}`];
  return [...assetBytesProblems(bytes, expected, source), ...installerSignatureProblems(bytes, signature, version, key)];
}

/** Each of `signatures` that does not verify over the disk image `bytes` with Sparkle's key `key` (as MAC_SPARKLE_PUBKEY), as a problem. */
function sparkleSignatureProblems(bytes, signatures, key) {
  if (signatures.length === 0) return [];
  const raw = canonicalBase64(key);
  if (raw?.length !== 32) return ["the Sparkle key is not 32 bytes as canonical base64"];
  const publicKey = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
  return signatures
    .filter((signature) => {
      const signed = canonicalBase64(signature);
      return signed?.length !== 64 || !verify(null, bytes, publicKey, signed);
    })
    .map((signature) => `the Sparkle signature ${JSON.stringify(signature)} does not verify over the downloaded disk image`);
}

/**
 * What is wrong with a disk image as an appcast enclosure's url serves it,
 * from whichever host: its size is not the length the enclosure tells Sparkle,
 * or it has no Sparkle signature, or one that does not verify over it with
 * `key` (as MAC_SPARKLE_PUBKEY), or, when `sources` (as windowsUpdateProblems
 * takes it) records `version`, the release the enclosure's item offers, its
 * bytes are not the size, SHA-256 and BLAKE2b-512 that record states.
 */
function servedDiskImageProblems(bytes, version, length, signatures, sources, key) {
  const problems = [];
  if (!/^[1-9][0-9]*$/.test(length ?? "") || Number(length) !== bytes.length) {
    problems.push(`${bytes.length} bytes, not the length ${JSON.stringify(length)} the enclosure states`);
  }
  if (signatures.length === 0) problems.push("no Sparkle signature to verify");
  problems.push(...sparkleSignatureProblems(bytes, signatures, key));
  const record = sources.record(version);
  if (record) problems.push(...assetBytesProblems(bytes, record.artifacts?.dmg, `releases/${version}.json`));
  return problems;
}

test("the served disk image check refuses another length, no signature, one that does not verify, and bytes its release's record does not describe", () => {
  const dmg = createHash("sha512").update("a disk image made for this test").digest();
  const rawKey = (key) => key.export({ format: "der", type: "spki" }).subarray(ED25519_SPKI_PREFIX.length).toString("base64");
  const sparkle = generateKeyPairSync("ed25519");
  const key = rawKey(sparkle.publicKey);
  const signature = sign(null, dmg, sparkle.privateKey).toString("base64");
  const flipped = Buffer.from(dmg);
  flipped[0] ^= 0x01;
  const hex = (digest, bytes) => createHash(digest).update(bytes).digest("hex");
  const flippedHex = (text) => `${text[0] === "0" ? "1" : "0"}${text.slice(1)}`;
  // The release of the disk image, 1.9.0, has no record unless a case gives
  // one; recorded() records this disk image, `edit` changing that record.
  const unrecorded = { record: () => undefined };
  const recorded = (edit) => {
    const record = { version: "1.9.0", artifacts: { dmg: { size: dmg.length, sha256: hex("sha256", dmg), blake2b512: hex("blake2b512", dmg) } } };
    edit?.(record.artifacts.dmg);
    return { record: (version) => (version === "1.9.0" ? record : undefined) };
  };
  // A case names `length` to change it, undefined for none.
  const check = (change) => {
    const { bytes = dmg, signatures = [signature], sparkleKey = key, sources = unrecorded } = change;
    return servedDiskImageProblems(bytes, "1.9.0", "length" in change ? change.length : String(dmg.length), signatures, sources, sparkleKey);
  };
  const refused = [
    [
      "a recorded release's disk image one byte off, by its SHA-256",
      { bytes: flipped, signatures: [sign(null, flipped, sparkle.privateKey).toString("base64")], sources: recorded() },
      /^sha256 .* is not .*, the digest releases\/1\.9\.0\.json states$/,
    ],
    [
      "a recorded release's disk image one byte off, by its BLAKE2b-512",
      { bytes: flipped, signatures: [sign(null, flipped, sparkle.privateKey).toString("base64")], sources: recorded() },
      /^blake2b512 .* is not .*, the digest releases\/1\.9\.0\.json states$/,
    ],
    [
      "a recorded release's disk image one byte short",
      { bytes: dmg.subarray(0, -1), length: String(dmg.length - 1), signatures: [sign(null, dmg.subarray(0, -1), sparkle.privateKey).toString("base64")], sources: recorded() },
      /^\d+ bytes, not the \d+ releases\/1\.9\.0\.json states$/,
    ],
    ["a record whose disk image size is one byte off", { sources: recorded((r) => (r.size += 1)) }, /^\d+ bytes, not the \d+ releases\/1\.9\.0\.json states$/],
    ["a record whose disk image SHA-256 is wrong", { sources: recorded((r) => (r.sha256 = flippedHex(r.sha256))) }, /^sha256 .* the digest releases\/1\.9\.0\.json states$/],
    ["a record whose disk image BLAKE2b-512 is wrong", { sources: recorded((r) => (r.blake2b512 = flippedHex(r.blake2b512))) }, /^blake2b512 .* the digest releases\/1\.9\.0\.json states$/],
    ["a disk image one byte longer than its enclosure says", { length: String(dmg.length - 1) }, /bytes, not the length "63"/],
    ["an enclosure length that is not a whole number", { length: `${dmg.length}.0` }, /bytes, not the length "64\.0"/],
    ["no enclosure length", { length: undefined }, /bytes, not the length undefined/],
    ["no signature", { signatures: [] }, /no Sparkle signature/],
    ["a disk image one byte off", { bytes: flipped, length: String(flipped.length) }, /Sparkle signature .* does not verify/],
    ["a signature by another key", { sparkleKey: rawKey(generateKeyPairSync("ed25519").publicKey) }, /Sparkle signature .* does not verify/],
    ["a second signature that does not verify", { signatures: [signature, SIGNATURE_1_9_0] }, /Sparkle signature .* does not verify/],
  ];
  const missed = refused.filter(([, change, expected]) => !check(change).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  assert.deepEqual(check({}), [], "a disk image of its stated length, signed, was refused");
  assert.deepEqual(check({ sources: recorded() }), [], "a disk image its release's record describes, of its stated length and signed, was refused");
});

test("the served installer check refuses bytes that are not the release's, on any host, and a signature that does not verify over them", () => {
  // The 1.9.0 installer public/downloads holds stands in for a downloaded one,
  // with its real updater signature, both as releases/1.9.0.json records it
  // and as a release with no record, which public/downloads alone describes.
  const record = releaseRecord("1.9.0");
  const exe = RELEASE_SOURCES.installer("1.9.0");
  assert.ok(record && exe, "releases/1.9.0.json or the 1.9.0 installer these cases start from is missing");
  const unrecorded = { installer: RELEASE_SOURCES.installer, record: () => undefined };
  const otherSignature = releaseRecords().find(({ version, record }) => version && version !== "1.9.0" && record?.artifacts?.exe)?.record.artifacts.exe.signature;
  assert.ok(otherSignature, "no record of a release other than 1.9.0 to take another signature from");
  const flipped = Buffer.from(exe);
  flipped[Math.floor(exe.length / 2)] ^= 0x01;
  const check = (change) => {
    const { bytes = exe, version = "1.9.0", signature = record.artifacts.exe.signature, sources = RELEASE_SOURCES } = change;
    return servedInstallerProblems(bytes, version, signature, sources, WINDOWS_UPDATER_PUBKEY);
  };
  const refused = [
    ["an installer one byte off, by its SHA-256", { bytes: flipped }, /^sha256 .* is not .*, the digest releases\/1\.9\.0\.json states$/],
    ["an installer one byte off, by its BLAKE2b-512", { bytes: flipped }, /^blake2b512 .* is not .*, the digest releases\/1\.9\.0\.json states$/],
    ["an installer one byte off, by its updater signature", { bytes: flipped }, /^the installer signature does not verify$/],
    ["an installer one byte short", { bytes: exe.subarray(0, -1) }, /^\d+ bytes, not the \d+ releases\/1\.9\.0\.json states$/],
    [
      "an unrecorded release's installer one byte off, by its SHA-256",
      { bytes: flipped, sources: unrecorded },
      /^sha256 .* is not .*, the digest public\/downloads\/Koegaki-1\.9\.0-setup\.exe states$/,
    ],
    [
      "an unrecorded release's installer one byte off, by its BLAKE2b-512",
      { bytes: flipped, sources: unrecorded },
      /^blake2b512 .* is not .*, the digest public\/downloads\/Koegaki-1\.9\.0-setup\.exe states$/,
    ],
    ["an unrecorded release's installer one byte off, by its updater signature", { bytes: flipped, sources: unrecorded }, /^the installer signature does not verify$/],
    ["an unrecorded release's installer one byte short", { bytes: exe.subarray(0, -1), sources: unrecorded }, /^\d+ bytes, not the \d+ public\/downloads\/Koegaki-1\.9\.0-setup\.exe states$/],
    ["an updater signature of another release", { signature: otherSignature }, /^the installer signature does not verify$/],
    [
      "another version than the file its updater signature names",
      { version: "1.9.9", sources: { installer: () => exe, record: () => undefined } },
      /^the trusted comment .* does not name Koegaki_1\.9\.9_x64-setup\.exe$/,
    ],
    ["a release neither recorded nor in public/downloads", { sources: { installer: () => undefined, record: () => undefined } }, /^neither releases\/1\.9\.0\.json nor public\/downloads/],
  ];
  const accepted = [
    ["the recorded release, as signed", {}],
    ["a release public/downloads alone describes, as signed", { sources: unrecorded }],
  ];
  const missed = refused.filter(([, change, expected]) => !check(change).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, change]) => [name, check(change)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

test(
  "the release assets downloaded from GitHub match their records and signatures",
  {
    skip: LINUX_FIXTURE
      ? "the fixture build's release is not published, so only the real build's run downloads"
      : process.env.RELEASE_FETCH === "1"
        ? false
        : "needs the network: run with RELEASE_FETCH=1, as the top of this file says",
  },
  async (t) => {
    const manifest = publicJson("windows-updates.json");
    const xml = readFileSync(new URL("../public/appcast.xml", import.meta.url), "utf8");
    // Run alone, this test first holds the live files and links to every
    // offline check of them (liveReleaseProblems, which the offline tests of
    // those files use too), so they serve exactly the urls the records state,
    // agree on the release they offer, and carry the record's signature and one
    // well formed Sparkle signature per disk image; what is downloaded below is
    // then what they serve.
    assert.deepEqual(liveReleaseProblems(manifest, xml, SITE_LINKS, RELEASE_SOURCES), [], "the live release files and links");
    const target = manifest.platforms["windows-x86_64"];
    const enclosures = enclosuresOf(appcastItems(xml).items);
    const served = [target.url, ...enclosures.map(({ url }) => url), ...Object.values(SITE_LINKS)];
    const versions = new Set(served.filter((url) => hostOf(url) === "github.com").map((url) => url.match(/\/releases\/download\/v(\d+\.\d+\.\d+)\//)?.[1]));
    const downloaded = new Map();
    const download = async (url) => {
      if (!downloaded.has(url)) {
        const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
        assert.ok(response.ok, `${url} answered HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        t.diagnostic(`${url} (served from ${new URL(response.url).host}): ${bytes.length} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
        downloaded.set(url, bytes);
      }
      return downloaded.get(url);
    };
    for (const version of versions) {
      const record = releaseRecord(version);
      assert.ok(record, `no releases/${version}.json records ${version}, which the site serves from GitHub`);
      const { urls, signatures, checked } = releaseDownloads(record, target, enclosures);
      const assets = {};
      for (const [kind, url] of Object.entries(urls)) assets[kind] = await download(url);
      if (record.artifacts.dmg && signatures.length === 0) t.diagnostic(`no appcast item offers ${record.artifacts.dmg.url}, so no Sparkle signature of it is checked`);
      const keys = { updater: WINDOWS_UPDATER_PUBKEY, sparkle: MAC_SPARKLE_PUBKEY, linux: LINUX_UPDATER_PUBKEY };
      assert.deepEqual(downloadedReleaseProblems(checked, assets, signatures, keys), [], `${version} as GitHub serves it`);
      const verified = [
        record.artifacts.exe && "the updater signature",
        record.artifacts.dmg && `${signatures.length} Sparkle signature${signatures.length === 1 ? "" : "s"}`,
        record.artifacts.deb && "the deb's updater signature",
      ].filter(Boolean);
      t.diagnostic(
        `${version}: ${Object.keys(urls).map((kind) => `the ${ASSET_WORD[kind]}`).join(" and ")} match releases/${version}.json in size, SHA-256 and BLAKE2b-512; ${verified.join(" and ")} verify over the downloaded bytes`,
      );
    }
    // The installer the manifest offers and the one the Windows link serves,
    // from whichever host, are the release's bytes, and the signature the
    // manifest carries verifies over them; the preflight holds the link to the
    // manifest's release.
    for (const url of new Set([target.url, SITE_LINKS.exe])) {
      const problems = servedInstallerProblems(await download(url), manifest.version, target.signature, RELEASE_SOURCES, WINDOWS_UPDATER_PUBKEY);
      assert.deepEqual(problems, [], `the installer at ${url}`);
      const source = RELEASE_SOURCES.record(manifest.version) ? `releases/${manifest.version}.json records` : "public/downloads holds";
      t.diagnostic(`${manifest.version}: ${url} is the installer ${source}, and the manifest's updater signature verifies over it`);
    }
    // Every disk image the appcast offers, from whichever host serves it, has
    // the length its enclosure states and the Sparkle signature it carries,
    // and is the disk image its release's record states when one records it;
    // the preflight holds the appcast to at least one.
    for (const { version, url, length, signatures } of enclosures) {
      const problems = servedDiskImageProblems(await download(url), version, length, signatures, RELEASE_SOURCES, MAC_SPARKLE_PUBKEY);
      assert.deepEqual(problems, [], `item ${version}: the disk image at ${url}`);
      const recorded = RELEASE_SOURCES.record(version) ? `, the disk image releases/${version}.json records,` : "";
      t.diagnostic(`item ${version}: ${url} is the ${length} bytes the appcast states${recorded} and its Sparkle signature verifies over them`);
    }
  },
);

test("the download check refuses bytes that differ from the record and signatures that do not verify over them", () => {
  // The 1.9.0 installer public/downloads holds stands in for a downloaded one,
  // with its real record and updater signature. No disk image is here, so one
  // is made up, recorded, and signed with a key made for this test.
  const record = structuredClone(releaseRecord("1.9.0"));
  const exe = RELEASE_SOURCES.installer("1.9.0");
  assert.ok(record && exe, "releases/1.9.0.json or the 1.9.0 installer these cases start from is missing");
  const hex = (digest, bytes) => createHash(digest).update(bytes).digest("hex");
  const dmg = createHash("sha512").update("a disk image made for this test").digest();
  Object.assign(record.artifacts.dmg, { size: dmg.length, sha256: hex("sha256", dmg), blake2b512: hex("blake2b512", dmg) });
  const rawKey = (key) => key.export({ format: "der", type: "spki" }).subarray(ED25519_SPKI_PREFIX.length).toString("base64");
  const sparkle = generateKeyPairSync("ed25519");
  const keys = { updater: WINDOWS_UPDATER_PUBKEY, sparkle: rawKey(sparkle.publicKey) };
  const edSignature = sign(null, dmg, sparkle.privateKey).toString("base64");
  const otherSignature = releaseRecords().find(({ version, record }) => version && version !== "1.9.0" && record?.artifacts?.exe)?.record.artifacts.exe.signature;
  assert.ok(otherSignature, "no record of a release other than 1.9.0 to take another signature from");
  const flipped = (bytes, at) => {
    const copy = Buffer.from(bytes);
    copy[at] ^= 0x01;
    return copy;
  };
  const flippedHex = (text) => `${text[0] === "0" ? "1" : "0"}${text.slice(1)}`;
  // A case names `from` to start from another record, as MAC_ONLY_RECORD.
  const check = (change) => {
    const { assets = { dmg, exe }, signatures = [edSignature], key = keys, edit, from = record } = change;
    const copy = structuredClone(from);
    edit?.(copy);
    return downloadedReleaseProblems(copy, assets, signatures, key);
  };
  // A Mac only release states, and so downloads, its disk image alone, and a
  // Linux only release its deb alone, checked with the key it was signed with.
  const macOnly = { from: MAC_ONLY_RECORD, assets: { dmg: MAC_ONLY_DMG }, signatures: [sign(null, MAC_ONLY_DMG, sparkle.privateKey).toString("base64")] };
  const linuxKeys = { ...keys, linux: LINUX_ONLY_KEY.pubkey };
  const linuxOnly = { from: LINUX_ONLY_RECORD, assets: { deb: LINUX_ONLY_DEB }, signatures: [], key: linuxKeys };
  // All three for 1.9.0: the record's disk image and installer, and the Linux
  // only release's deb bytes, signed as 1.9.0's deb.
  const debOf190 = {
    ...structuredClone(LINUX_ONLY_RECORD.artifacts.deb),
    url: githubAssetUrl("1.9.0", "deb"),
    signature: LINUX_ONLY_KEY.sign(createHash("blake2b512").update(LINUX_ONLY_DEB).digest(), bundlerDebName("1.9.0")),
  };
  const allThree = { edit: (r) => (r.artifacts.deb = structuredClone(debOf190)), assets: { dmg, exe, deb: LINUX_ONLY_DEB }, key: linuxKeys };
  const refused = [
    ["an installer one byte off", { assets: { dmg, exe: flipped(exe, Math.floor(exe.length / 2)) } }, /exe: sha256 .* is not/],
    ["an installer one byte off, by its BLAKE2b-512", { assets: { dmg, exe: flipped(exe, Math.floor(exe.length / 2)) } }, /exe: blake2b512 .* is not/],
    ["an installer one byte off, by its updater signature", { assets: { dmg, exe: flipped(exe, Math.floor(exe.length / 2)) } }, /exe: the installer signature does not verify/],
    ["an installer one byte short", { assets: { dmg, exe: exe.subarray(0, -1) } }, /exe: \d+ bytes, not the \d+ the record states/],
    ["a record whose installer size is one byte off", { edit: (r) => (r.artifacts.exe.size += 1) }, /exe: \d+ bytes, not the \d+ the record states/],
    ["a record whose installer SHA-256 is wrong", { edit: (r) => (r.artifacts.exe.sha256 = flippedHex(r.artifacts.exe.sha256)) }, /exe: sha256 .* is not/],
    ["a record whose installer BLAKE2b-512 is wrong", { edit: (r) => (r.artifacts.exe.blake2b512 = flippedHex(r.artifacts.exe.blake2b512)) }, /exe: blake2b512 .* is not/],
    ["a record whose disk image size is one byte off", { edit: (r) => (r.artifacts.dmg.size -= 1) }, /dmg: \d+ bytes, not the \d+ the record states/],
    ["a record whose disk image SHA-256 is wrong", { edit: (r) => (r.artifacts.dmg.sha256 = flippedHex(r.artifacts.dmg.sha256)) }, /dmg: sha256 .* is not/],
    ["a record whose disk image BLAKE2b-512 is wrong", { edit: (r) => (r.artifacts.dmg.blake2b512 = flippedHex(r.artifacts.dmg.blake2b512)) }, /dmg: blake2b512 .* is not/],
    ["an updater signature of another release", { edit: (r) => (r.artifacts.exe.signature = otherSignature) }, /exe: the installer signature does not verify/],
    ["a record of another version than the file its updater signature names", { edit: (r) => (r.version = "1.9.9") }, /exe: the trusted comment .* does not name Koegaki_1\.9\.9_x64-setup\.exe/],
    ["a disk image one byte off", { assets: { dmg: flipped(dmg, 0), exe } }, /dmg: the Sparkle signature .* does not verify/],
    ["a Sparkle signature by another key", { key: { ...keys, sparkle: rawKey(generateKeyPairSync("ed25519").publicKey) } }, /dmg: the Sparkle signature .* does not verify/],
    ["a Sparkle signature cut short", { signatures: [edSignature.slice(0, -4)] }, /dmg: the Sparkle signature .* does not verify/],
    ["a second Sparkle signature that does not verify", { signatures: [edSignature, SIGNATURE_1_9_0] }, /dmg: the Sparkle signature .* does not verify/],
    ["no disk image downloaded", { assets: { exe } }, /dmg: nothing was downloaded/],
    ["no installer downloaded", { assets: { dmg } }, /exe: nothing was downloaded/],
    ["a Mac only release whose disk image is one byte off", { ...macOnly, assets: { dmg: flipped(MAC_ONLY_DMG, 0) } }, /dmg: sha256 .* is not/],
    ["a Mac only release whose Sparkle signature does not verify", { ...macOnly, signatures: [edSignature] }, /dmg: the Sparkle signature .* does not verify/],
    ["a Mac only release with nothing downloaded", { ...macOnly, assets: {} }, /dmg: nothing was downloaded/],
    ["a Windows only release whose installer is one byte off", { edit: (r) => delete r.artifacts.dmg, assets: { exe: flipped(exe, Math.floor(exe.length / 2)) }, signatures: [] }, /exe: the installer signature does not verify/],
    ["a Linux only release whose deb is one byte off, by its SHA-256", { ...linuxOnly, assets: { deb: flipped(LINUX_ONLY_DEB, 0) } }, /deb: sha256 .* is not/],
    ["a Linux only release whose deb is one byte off, by its BLAKE2b-512", { ...linuxOnly, assets: { deb: flipped(LINUX_ONLY_DEB, 0) } }, /deb: blake2b512 .* is not/],
    ["a Linux only release whose deb is one byte off, by its updater signature", { ...linuxOnly, assets: { deb: flipped(LINUX_ONLY_DEB, 0) } }, /deb: the deb signature does not verify/],
    ["a Linux only release whose deb is one byte short", { ...linuxOnly, assets: { deb: LINUX_ONLY_DEB.subarray(0, -1) } }, /deb: \d+ bytes, not the \d+ the record states/],
    ["a Linux only release with nothing downloaded", { ...linuxOnly, assets: {} }, /deb: nothing was downloaded/],
    ["a Linux only release checked with a key the Linux build does not trust", { ...linuxOnly, key: { ...keys, linux: minisignKey().pubkey } }, /deb: the deb signature does not verify/],
    ["a Linux only release read as another version", { ...linuxOnly, edit: (r) => (r.version = "1.14.1") }, /deb: the trusted comment .* does not name com\.vishutdhar\.Koegaki_1\.14\.1_amd64\.deb/],
    ["a record whose deb size is one byte off", { ...linuxOnly, edit: (r) => (r.artifacts.deb.size += 1) }, /deb: \d+ bytes, not the \d+ the record states/],
    ["a release of all three with no deb downloaded", { ...allThree, assets: { dmg, exe } }, /deb: nothing was downloaded/],
    ["a release of all three whose deb is one byte off", { ...allThree, assets: { dmg, exe, deb: flipped(LINUX_ONLY_DEB, 0) } }, /deb: the deb signature does not verify/],
  ];
  const accepted = [
    ["the release as recorded and signed", {}],
    ["a disk image no appcast item offers, so with no Sparkle signature to check", { signatures: [] }],
    ["a Mac only release, its disk image as recorded and signed", macOnly],
    ["a Windows only release, its installer as recorded and signed", { edit: (r) => delete r.artifacts.dmg, assets: { exe }, signatures: [] }],
    ["a Linux only release, its deb as recorded and signed", linuxOnly],
    ["a release of all three, each as recorded and signed", allThree],
  ];
  const missed = refused.filter(([, change, expected]) => !check(change).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  const wronglyRefused = accepted.map(([name, change]) => [name, check(change)]).filter(([, problems]) => problems.length);
  assert.deepEqual(wronglyRefused, [], "these were refused");
});

test("the release download fetches every asset its record states and no other, each with the signature the feeds carry for it", () => {
  const record = releaseRecord("1.9.0");
  assert.ok(record, "releases/1.9.0.json, the record these cases start from, is missing");
  const windowsOnly = structuredClone(record);
  delete windowsOnly.artifacts.dmg;
  const allThree = structuredClone(record);
  allThree.artifacts.deb = { ...structuredClone(LINUX_ONLY_RECORD.artifacts.deb), url: githubAssetUrl("1.9.0", "deb") };
  // The manifest offers the recorded installer, with a signature of its own so
  // the cases tell it from the record's; the appcast offers both disk images,
  // one more, and an enclosure with no url, which no record's disk image is.
  const target = { url: record.artifacts.exe.url, signature: "the manifest's signature" };
  const enclosures = [
    { url: record.artifacts.dmg.url, signatures: ["the 1.9.0 disk image's"] },
    { url: MAC_ONLY_RECORD.artifacts.dmg.url, signatures: ["the Mac only disk image's"] },
    { url: "https://example.com/Koegaki.dmg", signatures: ["another disk image's"] },
    { url: undefined, signatures: ["an enclosure with no url's"] },
  ];
  const withManifestSignature = (from) => {
    const copy = structuredClone(from);
    copy.artifacts.exe.signature = target.signature;
    return copy;
  };
  const cases = [
    [
      "a release of both, its installer the manifest's",
      [record, target],
      { urls: { dmg: record.artifacts.dmg.url, exe: record.artifacts.exe.url }, signatures: ["the 1.9.0 disk image's"], checked: withManifestSignature(record) },
    ],
    [
      "a release of both, its installer not the manifest's",
      [record, { ...target, url: githubAssetUrl("1.9.1", "exe") }],
      { urls: { dmg: record.artifacts.dmg.url, exe: record.artifacts.exe.url }, signatures: ["the 1.9.0 disk image's"], checked: record },
    ],
    [
      "a Mac only release",
      [MAC_ONLY_RECORD, target],
      { urls: { dmg: MAC_ONLY_RECORD.artifacts.dmg.url }, signatures: ["the Mac only disk image's"], checked: structuredClone(MAC_ONLY_RECORD) },
    ],
    [
      "a Windows only release, its installer the manifest's",
      [windowsOnly, target],
      { urls: { exe: record.artifacts.exe.url }, signatures: [], checked: withManifestSignature(windowsOnly) },
    ],
    // No Linux feed exists yet (spec 2026-10-13-linux-site rule 5), so the deb
    // is checked with the signature its record states.
    ["a Linux only release", [LINUX_ONLY_RECORD, target], { urls: { deb: LINUX_ONLY_RECORD.artifacts.deb.url }, signatures: [], checked: structuredClone(LINUX_ONLY_RECORD) }],
    [
      "a release of all three, its installer the manifest's",
      [allThree, target],
      {
        urls: { dmg: allThree.artifacts.dmg.url, exe: allThree.artifacts.exe.url, deb: allThree.artifacts.deb.url },
        signatures: ["the 1.9.0 disk image's"],
        checked: withManifestSignature(allThree),
      },
    ],
  ];
  for (const [name, [from, offered], expected] of cases) assert.deepEqual(releaseDownloads(from, offered, enclosures), expected, name);
});

// ---- Linux (docs/specs/2026-10-13-linux-site.md) ----

/**
 * Every file under `dir` (a URL), as paths relative to it joined with "/",
 * following symbolic links as Next does when it serves public/: a folder
 * reached under two names is listed under both, since both are served, and
 * only a link back to a folder it is already inside is not followed, so a
 * loop ends. Read one with readUnder: a name may hold "#" or "%", which a URL
 * would read otherwise.
 */
function filesUnder(dir) {
  const files = [];
  const walk = (folder, prefix, inside) => {
    const real = realpathSync(folder);
    if (inside.has(real)) return;
    const within = new Set(inside).add(real);
    for (const name of readdirSync(folder)) {
      const stat = statSync(join(folder, name), { throwIfNoEntry: false });
      if (stat?.isDirectory()) walk(join(folder, name), `${prefix}${name}/`, within);
      else if (stat?.isFile()) files.push(`${prefix}${name}`);
    }
  };
  walk(fileURLToPath(dir), "", new Set());
  return files;
}

/** The bytes of `file`, a path filesUnder(dir) gave. */
const readUnder = (dir, file) => readFileSync(join(fileURLToPath(dir), ...file.split("/")));

test("the site these tests import offers exactly the Linux release the build found, and so does every page", () => {
  const release = linuxRelease(fileURLToPath(BUILD_RELEASES));
  assert.deepEqual(LINUX_RELEASE, release, "lib/site.ts and the build disagree about the Linux release");
  assert.equal(SITE.linuxDownloadUrl, release?.url ?? null);
  // Without one, the test below holds every page to saying nothing Linux.
  if (release) for (const path of ROUTES) assert.ok(html(path).includes(release.url), `${path} does not offer the Linux download`);
});

/**
 * The Linux update feeds a public folder would serve. Next serves every file
 * there under its own name, whatever its extension, so a feed is known by what
 * it holds: any file that parses as JSON and either sits under a name that
 * says Linux or lists a Linux target among its updater platforms (so a feed
 * shared with Windows is one too). models.json is not a feed: its linux block
 * is the Linux build's model list (Koegaki spec 2026-10-13-model-index-linux),
 * and it lists no platforms. An image named for Linux does not parse.
 */
function linuxFeedsIn(dir) {
  return filesUnder(dir)
    .filter((file) => {
      let parsed;
      try {
        parsed = JSON.parse(readUnder(dir, file).toString("utf8"));
      } catch {
        return false;
      }
      if (/linux/i.test(file)) return true;
      return isPlainObject(parsed?.platforms) && Object.keys(parsed.platforms).some((key) => /linux/i.test(key));
    })
    .sort();
}

test("the Linux feed check finds a feed by its name at any depth, or by a Linux platform in any feed", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "koegaki-feeds-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const write = (name, value) => {
    mkdirSync(join(dir, dirname(name)), { recursive: true });
    writeFileSync(join(dir, name), typeof value === "string" ? value : JSON.stringify(value));
  };
  const windows = { version: "1.13.1", platforms: { "windows-x86_64": { url: "u", signature: "s" } } };
  write("windows-updates.json", windows);
  write("models.json", { schema: 1, mac: {}, windows: {}, linux: { cleanup: {} } });
  write("downloads/Koegaki-1.9.0-setup.exe", "MZ");
  write("broken.json", "{");
  write("linux-tux.png", "an image, not a feed");
  const root = pathToFileURL(`${dir}/`);
  assert.deepEqual(linuxFeedsIn(root), [], "a Windows feed, the model index, an installer, a broken file and an image are not Linux feeds");
  write("linux-updates.json", {});
  write("updates/Linux-Updates.json", {});
  write("shared-updates.json", { ...windows, platforms: { ...windows.platforms, "linux-x86_64-deb": { url: "u", signature: "s" } } });
  write("nested/deeper/feed.json", { platforms: { "linux-x86_64": {} } });
  // Next serves any file in public/ under its own name, whatever its
  // extension, characters or link, so a feed is found by what it holds.
  write("updates.JSON", { platforms: { "linux-x86_64-deb": {} } });
  write("feed", { platforms: { "linux-x86_64-deb": {} } });
  write("nested/updates#stable.json", { platforms: { "linux-x86_64-deb": {} } });
  write("nested/100%25.json", { platforms: { "linux-x86_64-deb": {} } });
  const outside = mkdtempSync(join(tmpdir(), "koegaki-feeds-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "feed.json"), JSON.stringify({ platforms: { "linux-x86_64": {} } }));
  mkdirSync(join(outside, "more"));
  writeFileSync(join(outside, "more", "another.json"), JSON.stringify({ platforms: { "linux-x86_64": {} } }));
  symlinkSync(join(outside, "feed.json"), join(dir, "linked.json"));
  symlinkSync(join(outside, "more"), join(dir, "linked-folder"));
  symlinkSync(dir, join(dir, "nested", "loop"));
  // Two names for one folder are two served paths: the one that says Linux counts.
  write("linux/plain.json", { version: "1.14.0" });
  symlinkSync(join(dir, "linux"), join(dir, "aaa"));
  assert.deepEqual(linuxFeedsIn(root), [
    "feed",
    "linked-folder/another.json",
    "linked.json",
    "linux-updates.json",
    "linux/plain.json",
    "nested/100%25.json",
    "nested/deeper/feed.json",
    "nested/updates#stable.json",
    "shared-updates.json",
    "updates.JSON",
    "updates/Linux-Updates.json",
  ]);
});

/**
 * The update sentence of the Linux page once Koegaki for Linux updates itself
 * (Koegaki spec 2026-10-13-linux-updater rule 11): unit 10 sets
 * LINUX_UPDATES (lib/pages.ts) to exactly this when it adds the Linux feed.
 */
const LINUX_UPDATES_IN_APP =
  "Koegaki for Linux checks for a new version when you open its window. Install and restart asks for your password, installs the new version and opens it. If it cannot, it shows the download and the one command to install it yourself. Your settings, history and downloaded models stay as they are.";

/**
 * What is wrong with the Linux feeds public/ serves: `named`, every Linux feed
 * there (linuxFeedsIn); `feed`, the parsed linux-updates.json when one is
 * served; `real`, the real Linux release (linuxRelease over releases/, the
 * same in both test runs, since the fixture build's synthetic release is never
 * what public/ offers), or null; and `sources`: the real record of a version,
 * the real Linux key, and the Windows feed. With no Linux release no feed may
 * be served; with one, linux-updates.json is served, alone, for that release.
 */
function servedLinuxFeedProblems(named, feed, real, sources) {
  if (!real) {
    return named.length === 0 ? [] : [`public/ serves ${JSON.stringify(named)}, but no release record holds a deb, so there is no Linux release for it to offer`];
  }
  if (named.length !== 1 || named[0] !== "linux-updates.json") {
    return [`a Linux release is recorded, and public/ serves ${JSON.stringify(named)}, not linux-updates.json alone`];
  }
  const problems = linuxUpdateProblems(feed, sources.record(feed?.version), sources.key, sources.windowsFeed);
  if (feed?.version !== real.version) problems.push(`the feed offers ${JSON.stringify(feed?.version)}, not the Linux release ${real.version}`);
  return problems;
}

/** What is wrong with the page's update sentence: while a Linux feed is served, it is LINUX_UPDATES_IN_APP. */
function linuxUpdatesSentenceProblems(served, sentence) {
  return served && sentence !== LINUX_UPDATES_IN_APP ? ["a Linux feed is served, and LINUX_UPDATES is not the sentence for the in app update"] : [];
}

/** The real record of `version` in releases/, never the fixture's. */
function realReleaseRecord(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return undefined;
  const file = new URL(`${version}.json`, RELEASES);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

test("the Linux update feed is public/linux-updates.json, served with the Linux release and naming the deb its signature covers", () => {
  // Koegaki spec 2026-10-13-linux-updater rule 11, replacing the guard of this
  // repo's spec 2026-10-13-linux-site rule 5 with the feed's own checks.
  const named = linuxFeedsIn(new URL("../public/", import.meta.url));
  const feed = named.includes("linux-updates.json") ? publicJson("linux-updates.json") : undefined;
  const real = linuxRelease(fileURLToPath(RELEASES));
  const sources = { record: realReleaseRecord, key: LINUX_UPDATER_PUBKEY, windowsFeed: publicJson("windows-updates.json") };
  assert.deepEqual(servedLinuxFeedProblems(named, feed, real, sources), []);
});

test("the Linux page does not say Koegaki cannot update itself while a Linux feed is served", () => {
  // Koegaki spec 2026-10-13-linux-updater rule 11: with a feed, the app
  // installs updates itself, and the page says so in the one approved sentence.
  const served = linuxFeedsIn(new URL("../public/", import.meta.url)).length > 0;
  assert.deepEqual(linuxUpdatesSentenceProblems(served, LINUX_UPDATES), []);
});

test("the served feed check holds the feed to the real Linux release, and the page to the approved sentence", () => {
  const record = LINUX_ONLY_RECORD;
  const feedOf = (version) => ({
    version,
    notes: "What changed.",
    pub_date: "2026-11-02T10:00:00Z",
    platforms: { "linux-x86_64": { url: record.artifacts.deb.url, signature: record.artifacts.deb.signature } },
  });
  const sources = { record: (version) => (version === record.version ? record : undefined), key: LINUX_ONLY_KEY.pubkey, windowsFeed: undefined };
  const real = { version: "1.14.0", url: record.artifacts.deb.url };
  assert.deepEqual(servedLinuxFeedProblems([], undefined, null, sources), [], "no release, no feed");
  assert.match(servedLinuxFeedProblems(["linux-updates.json"], feedOf("1.14.0"), null, sources).join("\n"), /no release record holds a deb/);
  assert.match(servedLinuxFeedProblems([], undefined, real, sources).join("\n"), /not linux-updates\.json alone/, "a release without its feed");
  assert.match(servedLinuxFeedProblems(["linux-updates.json", "x.json"], feedOf("1.14.0"), real, sources).join("\n"), /not linux-updates\.json alone/);
  assert.deepEqual(servedLinuxFeedProblems(["linux-updates.json"], feedOf("1.14.0"), real, sources), []);
  // A later Linux release: the feed must offer it, in either run.
  const later = { version: "1.14.1", url: githubAssetUrl("1.14.1", "deb") };
  assert.match(servedLinuxFeedProblems(["linux-updates.json"], feedOf("1.14.0"), later, sources).join("\n"), /not the Linux release 1\.14\.1/);
  assert.deepEqual(linuxUpdatesSentenceProblems(false, LINUX_UPDATES), []);
  assert.deepEqual(linuxUpdatesSentenceProblems(true, LINUX_UPDATES_IN_APP), []);
  // Denials as fixed text: LINUX_UPDATES itself becomes the approved sentence in unit 10.
  const todaysDenial =
    "Koegaki for Linux does not install updates itself. To update, download the newest package from this page and install it the same way; apt replaces the old version, and your settings, history and downloaded models stay as they are.";
  for (const denial of [todaysDenial, "Koegaki for Linux cannot update itself. Download and install updates manually."]) {
    assert.equal(linuxUpdatesSentenceProblems(true, denial).length, 1, denial);
  }
});

test("the Linux feed check refuses a damaged feed, record, signature or key", () => {
  const fixtureRecord = JSON.parse(readFileSync(new URL("1.14.0.json", FIXTURE_RELEASES), "utf8"));
  const feedFor = (record) => ({
    version: record.version,
    notes: "What changed.",
    pub_date: "2026-11-02T10:00:00Z",
    platforms: { "linux-x86_64": { url: record.artifacts.deb.url, signature: record.artifacts.deb.signature } },
  });
  // The fixture's signed record and the self tests' record both pass, each
  // with the key it was signed with, and with no other.
  assert.deepEqual(linuxUpdateProblems(feedFor(fixtureRecord), fixtureRecord, LINUX_FIXTURE_PUBKEY), []);
  assert.deepEqual(linuxUpdateProblems(feedFor(LINUX_ONLY_RECORD), LINUX_ONLY_RECORD, LINUX_ONLY_KEY.pubkey), []);
  assert.match(linuxUpdateProblems(feedFor(fixtureRecord), fixtureRecord, LINUX_UPDATER_PUBKEY).join("\n"), /the key ids differ|does not verify/);

  const record = LINUX_ONLY_RECORD;
  const key = LINUX_ONLY_KEY.pubkey;
  const digest = Buffer.from(record.artifacts.deb.blake2b512, "hex");
  const otherDigest = createHash("blake2b512").update("other bytes").digest();
  const withDeb = (change) => {
    const copy = structuredClone(record);
    change(copy.artifacts.deb);
    return copy;
  };
  const otherFile = withDeb((deb) => (deb.signature = LINUX_ONLY_KEY.sign(digest, bundlerDebName("1.13.9"))));
  const cases = [
    ["a deb only key", (feed) => (feed.platforms = { "linux-x86_64-deb": feed.platforms["linux-x86_64"] }), record, /not linux-x86_64 alone/],
    ["a second Linux key beside it", (feed) => (feed.platforms["linux-x86_64-deb"] = feed.platforms["linux-x86_64"]), record, /not linux-x86_64 alone/],
    ["a Windows platform beside it", (feed) => (feed.platforms["windows-x86_64"] = { url: "https://koegaki.com/x.exe", signature: "s" }), record, /not linux-x86_64 alone/],
    ["another url", (feed) => (feed.platforms["linux-x86_64"].url = githubAssetUrl("1.13.9", "deb")), record, /is not the deb url/],
    ["another signature", (feed) => (feed.platforms["linux-x86_64"].signature = LINUX_ONLY_KEY.sign(otherDigest, bundlerDebName("1.14.0"))), record, /another signature|does not verify/],
    ["a prerelease version", (feed) => (feed.version = "1.14.0-beta"), record, /not a SemVer core/],
    ["no notes", (feed) => delete feed.notes, record, /notes undefined is not a string/],
    ["a date that is not RFC 3339", (feed) => (feed.pub_date = "2 November 2026"), record, /RFC 3339/],
    ["a platform that is not an object", (feed) => (feed.platforms["linux-x86_64"] = "u"), record, /not an object/],
    ["a top level url the updater cannot read", (feed) => (feed.url = 42), record, /not version, notes, pub_date and platforms alone/],
    ["a top level signature", (feed) => (feed.signature = "s"), record, /not version, notes, pub_date and platforms alone/],
    ["a name beside the version", (feed) => (feed.name = "1.14.0"), record, /not version, notes, pub_date and platforms alone/],
    ["no record of the version", () => {}, undefined, /no releases\/1\.14\.0\.json records/],
    ["a record without a deb", () => {}, MAC_ONLY_RECORD_AS("1.14.0"), /records no deb/],
    ["a record whose deb digest is not the signed one", () => {}, withDeb((deb) => (deb.blake2b512 = otherDigest.toString("hex"))), /does not verify/],
    ["a signature naming another file, in feed and record alike", (feed) => (feed.platforms["linux-x86_64"].signature = otherFile.artifacts.deb.signature), otherFile, /does not name com\.vishutdhar\.Koegaki_1\.14\.0_amd64\.deb/],
  ];
  for (const [name, change, recorded, expected] of cases) {
    const feed = feedFor(record);
    change(feed);
    assert.match(linuxUpdateProblems(feed, recorded, key).join("\n"), expected, name);
  }
  // A release on both platforms: the notes are the Windows feed's.
  const windowsOf = (version, notes) => ({ version, notes, pub_date: "2026-11-02T10:00:00Z", platforms: {} });
  assert.match(
    linuxUpdateProblems(feedFor(record), record, key, windowsOf("1.14.0", "Something else.")).join("\n"),
    /the notes are not the Windows feed's/,
  );
  assert.deepEqual(linuxUpdateProblems(feedFor(record), record, key, windowsOf("1.14.0", "What changed.")), []);
  assert.deepEqual(linuxUpdateProblems(feedFor(record), record, key, windowsOf("1.13.1", "Something else.")), [], "another version's notes are its own");
});

test(
  "while no release record holds a deb, nothing Linux is built",
  { skip: LINUX_ON ? "a release record holds a deb, so the site shows Linux; spec rule 8 holds only before that" : false },
  () => {
    assert.equal(LINUX_RELEASE, null);
    assert.deepEqual([SITE.linuxDownloadUrl, SITE.linuxRequirements, SITE.linuxEngine], [null, null, null]);
    assert.ok(!LANDING_PAGES.some(({ path }) => path === "/linux"), "LANDING_PAGES lists /linux");
    // No prerendered file, no route output and no static asset says Linux, in
    // any case: today's build never does (spec section 2).
    for (const [root, files] of [[BUILT, filesUnder(BUILT)], [new URL("static/", BUILD_ROOT), filesUnder(new URL("static/", BUILD_ROOT))]]) {
      assert.ok(files.length > 0, `no build output under ${fileURLToPath(root)}`);
      for (const file of files) {
        assert.doesNotMatch(file, /linux/i, `the build has an output named ${file}`);
        const text = readUnder(root, file).toString("latin1");
        const at = text.search(/linux/i);
        assert.equal(at, -1, `${file} says Linux: ${JSON.stringify(text.slice(Math.max(0, at - 60), at + 60))}`);
      }
    }
  },
);

/**
 * Digests of every prerendered file of the build (html, rsc, segment rsc,
 * body and meta), with the build id and the two download links read as
 * placeholders, so a Mac or Windows release does not move them and a second
 * build of the same code gives the same digests.
 */
function gateOffDigests() {
  const buildId = readFileSync(new URL("BUILD_ID", BUILD_ROOT), "utf8").trim();
  const digests = {};
  for (const file of filesUnder(BUILT).filter((name) => /\.(?:html|rsc|body|meta)$/.test(name)).sort()) {
    const text = readUnder(BUILT, file)
      .toString("latin1")
      .replaceAll(buildId, "<build id>")
      .replaceAll(SITE.downloadUrl, "<Mac download>")
      .replaceAll(SITE.windowsDownloadUrl, "<Windows download>");
    digests[file] = createHash("sha256").update(Buffer.from(text, "latin1")).digest("hex");
  }
  return digests;
}

const GATE_OFF_PIN = new URL("fixtures/gate-off-pin.json", import.meta.url);

test(
  "without a Linux release every page is today's, to the byte",
  {
    skip: LINUX_FIXTURE
      ? "the fixture build has a Linux release"
      : LINUX_ON
        ? "a release record holds a deb, so the pin of the site before Linux no longer applies (spec rule 8)"
        : false,
  },
  () => {
    // The pin was taken from the build of main 09b3976, before any Linux code.
    // A deliberate change to today's pages refreshes it with
    // UPDATE_GATE_OFF_PIN=1 npm test, and its diff names every file it moves.
    const digests = gateOffDigests();
    if (process.env.UPDATE_GATE_OFF_PIN === "1") writeFileSync(GATE_OFF_PIN, `${JSON.stringify(digests, null, 2)}\n`);
    assert.deepEqual(digests, JSON.parse(readFileSync(GATE_OFF_PIN, "utf8")), "a prerendered file differs from the pin of the site before Linux");
  },
);

/** The pre-paint platform stamp script of a page. */
function stampScript(doc) {
  const head = doc.slice(0, doc.indexOf("</head>"));
  const scripts = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter((s) => s.includes("data-os"));
  assert.equal(scripts.length, 1, "expected one platform stamp script in the head");
  return scripts[0];
}

test("the platform stamp marks Windows, and Linux only with a Linux release, never Android or ChromeOS", () => {
  const script = stampScript(html("/"));
  for (const path of ROUTES) assert.equal(stampScript(html(path)), script, `${path} stamps differently`);
  const stamp = (navigator) => {
    const attributes = {};
    const documentElement = { setAttribute: (name, value) => (attributes[name] = value) };
    runInNewContext(script, { navigator, document: { documentElement } });
    return attributes["data-os"];
  };
  const linux = LINUX_ON ? "linux" : undefined;
  const cases = [
    ["Chrome on Windows", { userAgentData: { platform: "Windows" }, platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" }, "win"],
    ["Firefox on Windows", { platform: "Win32", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0" }, "win"],
    ["Safari on a Mac", { platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15" }, undefined],
    ["Chrome on a Mac", { userAgentData: { platform: "macOS" }, platform: "MacIntel", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140.0" }, undefined],
    ["Chrome on Linux", { userAgentData: { platform: "Linux" }, platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" }, linux],
    ["Firefox on Linux", { platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0" }, linux],
    ["Firefox on Linux under Wayland, with no platform", { platform: "", userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0" }, linux],
    ["Chrome on Android", { userAgentData: { platform: "Android" }, platform: "Linux armv81", userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" }, undefined],
    ["Firefox on Android", { platform: "Linux armv81", userAgent: "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0" }, undefined],
    ["Chrome on ChromeOS", { userAgentData: { platform: "Chrome OS" }, platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16328.0.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36" }, undefined],
    ["a ChromeOS browser with no client hints", { platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16328.0.0) Gecko/20100101 Firefox/143.0" }, undefined],
    ["a browser that says nothing", {}, undefined],
  ];
  const wrong = cases.map(([what, navigator, expected]) => [what, stamp(navigator), expected]).filter(([, got, expected]) => got !== expected);
  assert.deepEqual(wrong, [], "stamped otherwise than expected: [visitor, stamped, expected]");
});

/**
 * The style that makes the platform words work with a Linux release (spec
 * rule 10), in every page's head: the Linux word hides off Linux, the Mac word
 * on Linux, and the PC word, shown on Windows and Linux, on the Mac. Like the
 * stylesheet's own two rules, each only ever adds display:none.
 */
const LINUX_STAMP_STYLE =
  'html:not([data-os="linux"]) .os-linux{display:none}[data-os="linux"] .os-mac{display:none}html:not([data-os="win"]):not([data-os="linux"]) .os-pc{display:none}';

const withLinux = { skip: LINUX_ON ? false : "no release record holds a deb, so no page shows Linux" };

test("with a Linux release every page's head carries the Linux platform style, and only then", () => {
  for (const path of ROUTES) {
    const head = html(path).slice(0, html(path).indexOf("</head>"));
    const styles = [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    assert.deepEqual(styles, LINUX_ON ? [LINUX_STAMP_STYLE] : [], `the inline styles in the head of ${path}`);
  }
});

/** Every anchor of a document with its href, class and text. */
function anchorsWithClass(doc) {
  return [...doc.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: decodeEntities(attr(` ${m[1]}`, "href") ?? ""),
    classes: (attr(` ${m[1]}`, "class") ?? "").split(/\s+/),
    text: decodeEntities(m[2].replace(/<[^>]*>/g, "")).trim(),
  }));
}

test("with a Linux release every download button offers the deb beside the Mac and Windows ones", withLinux, () => {
  for (const path of ROUTES) {
    const buttons = anchorsWithClass(html(path)).filter(({ classes }) => classes.includes("group"));
    const of = (os) => buttons.filter(({ classes }) => classes.includes(`os-${os}`));
    const [mac, win, linux] = [of("mac"), of("win"), of("linux")];
    assert.ok(mac.length > 0, `${path} has no download button`);
    assert.deepEqual([win.length, linux.length], [mac.length, mac.length], `${path}: Mac, Windows and Linux buttons differ in number`);
    assert.deepEqual(new Set(mac.map(({ href }) => href)), new Set([SITE.downloadUrl]), path);
    assert.deepEqual(new Set(win.map(({ href }) => href)), new Set([SITE.windowsDownloadUrl]), path);
    assert.deepEqual(new Set(linux.map(({ href }) => href)), new Set([SITE.linuxDownloadUrl]), path);
    // A button's words are the same on every platform.
    for (let i = 0; i < mac.length; i++) assert.deepEqual([win[i].text, linux[i].text], [mac[i].text, mac[i].text], `${path} button ${i}`);
  }
});

test("with a Linux release every platform note names its requirement and links the other two platforms", withLinux, () => {
  let notes = 0;
  for (const path of ROUTES) {
    const spans = [...html(path).matchAll(/<span class="os-(mac|win|linux)">((?:(?!<\/span>)[\s\S])*)<\/span>/g)]
      .filter((m) => m[2].includes("<a "))
      .map((m) => ({ os: m[1], text: decodeEntities(m[2].replace(/<[^>]*>/g, "").replace(/<!-- -->/g, "")), links: anchorsWithClass(m[2]).map(({ href, text }) => [href, text]) }));
    const of = (os) => spans.filter((span) => span.os === os);
    assert.deepEqual([of("win").length, of("linux").length], [of("mac").length, of("mac").length], `${path}: the notes differ in number`);
    for (const span of spans) {
      notes++;
      const expected = {
        mac: [[SITE.windowsDownloadUrl, "Download for Windows"], [SITE.linuxDownloadUrl, "Download for Linux"]],
        win: [[SITE.downloadUrl, "Download for Mac"], [SITE.linuxDownloadUrl, "Download for Linux"]],
        linux: [["/linux", "Install steps"], [SITE.downloadUrl, "Download for Mac"], [SITE.windowsDownloadUrl, "Download for Windows"]],
      }[span.os];
      assert.deepEqual(span.links, expected, `${path}: the ${span.os} note's links`);
    }
    for (const span of of("linux")) assert.ok(span.text.startsWith(`${SITE.linuxRequirements} · `), `${path}: the Linux note says ${span.text}`);
    for (const span of of("win")) assert.ok(span.text.startsWith(`${SITE.windowsRequirements} · `), `${path}: the Windows note says ${span.text}`);
  }
  assert.ok(notes > 0, "no page has a platform note");
});

test("with a Linux release the home page names it in the stamp label, the footer and the product data", withLinux, () => {
  const doc = html("/");
  assert.match(doc, /<span class="os-linux">Debian &amp; Ubuntu<\/span>/, "the hero's platform label");
  for (const path of ROUTES) {
    const links = anchors(footer(html(path))).map(({ href, text }) => [href, text]);
    assert.ok(links.some(([href, text]) => href === SITE.linuxDownloadUrl && text === "Linux"), `${path}'s footer has no Linux download`);
    assert.ok(links.some(([href]) => href === "/linux") || !footer(html(path)).includes("Platforms"), `${path}'s footer does not link the Linux page`);
  }
  const app = jsonLd(doc).find((n) => n["@type"] === "SoftwareApplication");
  assert.equal(app.operatingSystem, "macOS 14.0 or later, Windows 10, Windows 11, Debian 12 or later, Ubuntu 22.04 or later");
  const linuxApp = jsonLd(html("/linux")).find((n) => n["@type"] === "SoftwareApplication");
  assert.equal(linuxApp.operatingSystem, "Debian 12 or later, Ubuntu 22.04 or later");
});

test("with a Linux release no page says Koegaki is for two platforms", withLinux, () => {
  // A pair that closes a longer list ("Linux, Windows and Mac") names three.
  const twoPlatforms = /(?<!, )\b(?:mac and windows|windows and mac|mac or pc|mac or windows)\b|\bboth platforms\b|\bcovers both\b|\bfor both\b|\bon mac and on windows\b/i;
  for (const path of ROUTES) {
    const doc = html(path);
    const { body, standalone } = textBlocks(doc);
    for (const text of [...body.map(({ text }) => text), ...standalone, doc.match(/<title>([^<]*)<\/title>/)[1]]) {
      assert.doesNotMatch(text, twoPlatforms, `${path} names two platforms: "${text}"`);
    }
    // A comparison row label is a table header cell; check it too.
    assert.doesNotMatch(doc, /<th scope="row"[^>]*>(?:Windows|Mac) version<\/th>/, `${path} has a one platform version row`);
  }
});

test("with a Linux release every page's lastmod is at least the day the Linux copy went live", withLinux, () => {
  const xml = built("sitemap.xml.body");
  for (const [, lastmod] of xml.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) {
    assert.ok(lastmod >= LINUX_COPY_DATE, `lastmod ${lastmod} predates the Linux copy (${LINUX_COPY_DATE})`);
  }
});

// Each platform's default shortcut is its own (Koegaki spec
// 2026-10-13-linux-default-chord rule 1): the Linux app defaults to
// Ctrl+Alt+K, because Ubuntu's GNOME session binds Ctrl+Alt+D to show
// desktop, and Windows keeps Ctrl+Alt+D. The how it works keycaps show
// each platform its own chord, and nothing tells a Linux visitor to press
// Ctrl+Alt+D.
function howItWorksKeys(doc) {
  const keys = (cls) => {
    // Matched loosely on purpose: Tailwind scans this file too, so a
    // class name written here that no component uses would add a rule to
    // the stylesheet and move every page off the gate off pin.
    const block = doc.match(new RegExp(`<div class="${cls} mt-4 [^"]*">([\\s\\S]*?)</div>`));
    return block ? [...block[1].matchAll(/<kbd[^>]*>([\s\S]*?)<\/kbd>/g)].map((m) => m[1]) : null;
  };
  return { win: keys("os-win"), linux: keys("os-linux"), pc: keys("os-pc") };
}

test("the how it works keycaps show Windows its own default shortcut", () => {
  const caps = howItWorksKeys(html("/"));
  assert.deepEqual(caps.win, ["Ctrl", "Alt", "D"], "Windows keeps Ctrl+Alt+D");
  assert.equal(caps.pc, null, "no keycaps are shared by Windows and Linux");
  if (!LINUX_ON) assert.equal(caps.linux, null, "no Linux keycaps without a Linux release");
});

test("with a Linux release the how it works keycaps and the Linux page name Ctrl+Alt+K", withLinux, () => {
  assert.deepEqual(howItWorksKeys(html("/")).linux, ["Ctrl", "Alt", "K"]);
  const text = decodeEntities(pageText(html("/linux")));
  assert.ok(text.includes("The default shortcut is Ctrl+Alt+K"), "the Linux page names the Linux default");
  assert.doesNotMatch(text, /Ctrl\+Alt\+D/, "the Linux page never names the Windows default");
});

test("the Linux page tells a visitor how to install, check, repair, update and remove Koegaki, with the record's digest", withLinux, () => {
  const doc = html("/linux");
  const deb = ASSET_NAME.deb(LINUX_RELEASE.version);
  const record = releaseRecord(LINUX_RELEASE.version);
  assert.equal(LINUX_RELEASE.sha256, record?.artifacts?.deb?.sha256, "the page's digest is not the record's");
  const commands = [...doc.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map((m) => decodeEntities(m[1].replace(/<!-- -->/g, "")));
  assert.deepEqual(commands, [
    `sudo apt install ./${deb}`,
    `echo "${record.artifacts.deb.sha256}  ${deb}" | sha256sum --check`,
    "sudo /usr/libexec/koegaki/koegaki-device-access repair",
    "sudo apt remove com-vishutdhar-koegaki",
  ]);
  const text = decodeEntities(pageText(doc));
  for (const said of [
    LINUX_UPDATES,
    "Debian 12 or Ubuntu 22.04 or newer",
    "x86_64",
    "~/.config/koegaki",
    "~/.local/share/koegaki",
    SITE.contactEmail,
    "never read them",
    "administrator",
  ]) {
    assert.ok(text.includes(said), `the Linux page does not say "${said}"`);
  }
  // Linux terminals paste with Ctrl+Shift+V; Koegaki presses Ctrl+V (spec rule
  // 14). The page's own copy never names one (the footer's Freedom Terminal is
  // the brand, not a place to dictate).
  const page = LANDING_PAGES.find(({ path }) => path === "/linux");
  const copy = JSON.stringify([page.lede, page.description, page.sections, page.faqs]).replaceAll(SITE.contactEmail, "");
  assert.doesNotMatch(copy, /\bterminals?\b/i, "the Linux page promises dictation into a terminal");
});
