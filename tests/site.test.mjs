// Checks the BUILT site (the prerendered HTML and sitemap in .next), not the
// source, so what is pinned here is exactly what a crawler is served. Run with
// `npm test`, which builds first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { SITE } from "../lib/site.ts";
import { LANDING_PAGES } from "../lib/pages.ts";
import { COMPARISONS } from "../lib/compare.ts";

const BUILT = new URL("../.next/server/app/", import.meta.url);

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
  // The separator lives inside the Windows word, directly after the space
  // before the Mac word, so whichever word is shown gets exactly one space.
  assert.match(h1, /on your <span class="os-mac">Mac<\/span><span class="os-win"> PC<\/span>\./);
  // ...which only holds while the stylesheet removes the other word entirely.
  const css = [...doc.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)]
    .map((m) => readFileSync(new URL(`../.next${m[1].slice("/_next".length)}`, import.meta.url), "utf8"))
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
 * afd62e12) and say nothing it does not do, each with the reason. The check
 * fails closed: an honest sentence that trips it is reviewed and added here;
 * there is no other way past it. The route test drops an entry the site no
 * longer says.
 */
const REVIEWED_SENTENCES = new Map([
  [
    "And the model is always on your Mac, for every language it supports, with nothing falling back to a server.",
    "about the speech model, which does run on the Mac for every language it supports, not about custom words",
  ],
]);

/** A block's sentences, split where a sentence ends. */
const sentencesOf = (block) => block.split(/(?<=[.!?])\s+/);

/**
 * What a page says about custom words that the app does not do (Koegaki spec
 * 2026-10-04). A custom word changes how a run of words the recognizer already
 * heard is written, never what Koegaki hears (item 2), and recognizer biasing
 * is out of that spec's scope, so no sentence about custom words may use the
 * words of learning, training, teaching, biasing, recognition, understanding,
 * accuracy, unknown words or misspellings, in any form of those words. They ship on both platforms, so
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
    page("<p>Custom words change how a word is written, not what is heard.</p>"),
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
    "Custom words never change what Koegaki recognises.",
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
  const engines = { mac: SITE.engine, windows: SITE.windowsEngine };
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
const REVIEWED_WAIT_SENTENCES = new Map([
  [MAC_WAIT, { where: ["/mac"], why: "the Mac waits on an expensive path (Personal Hotspot) or a constrained one (Low Data Mode)" }],
  [WINDOWS_WAIT, { where: ["/windows"], why: "Windows waits on the cost it reports; Wi-Fi counts only once marked metered" }],
  [BOTH_WAIT, { where: ["/", "/offline-dictation"], why: "the same rule for both platforms, each example under its own OS" }],
  [PRIVACY_WAIT, { where: ["/privacy"], why: "names the two downloads that wait, not every download the app starts" }],
  [
    "Costly connections include an iPhone's Personal Hotspot and Low Data Mode on a Mac, and in Windows a cellular link and any network you marked as metered, which you can do for a phone hotspot.",
    { where: ["/privacy"], why: "each OS's own signal" },
  ],
  [
    "A download you start yourself, and the first download after you install, go ahead on any connection.",
    { where: ["/privacy"], why: "a download the user starts and the first install have no gate on either platform" },
  ],
]);
/** The sentences that state the wait itself. */
const WAIT_CLAIMS = [MAC_WAIT, WINDOWS_WAIT, BOTH_WAIT, PRIVACY_WAIT];

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
  };
  assert.ok(served.mac && served.windows, `no served version in the download links ${JSON.stringify(served)}`);
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
      const names = { mac: /\bmac\b/i.test(sentence), windows: /\bwindows\b/i.test(sentence) };
      // A sentence naming one platform answers to that platform's version; one
      // naming both or neither is stale only once every platform serves it.
      const platforms = names.mac !== names.windows ? [names.mac ? "mac" : "windows"] : ["mac", "windows"];
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
 * The Mac decodes both platform blocks, so a mistyped Windows entry breaks it
 * too, and every entry here is held to the stricter Windows component rule for
 * its identity and manifest, which every current entry already meets.
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
  // Int for the mac block, a Windows u64 for the windows block.
  const LARGEST_PART = { mac: 2n ** 63n - 1n, windows: 2n ** 64n - 1n };
  const appVersion = (v, platform) =>
    typeof v === "string" &&
    /^[0-9]+(?:\.[0-9]+){0,2}$/.test(v) &&
    v.split(".").every((part) => BigInt(part) <= LARGEST_PART[platform]);
  const problems = [];
  if (!index || typeof index !== "object") return ["the index is not an object"];
  if (index.schema !== 1) problems.push(`schema ${JSON.stringify(index.schema)} is not 1`);
  for (const platform of ["mac", "windows"]) {
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
      }
      if (!optionalString(e.vad)) problems.push(`${at}: vad is not a string`);
      if (!optionalString(e.notes)) problems.push(`${at}: notes is not a string`);
    }
  }
  return problems;
}

test("every model index entry passes the rules both app readers apply", () => {
  assert.deepEqual(modelIndexProblems(publicJson("models.json")), []);
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
  ];
  const accepted = [
    ["the index as published", () => {}],
    ["a Windows min_app part at the u64 limit", (i) => (i.windows["speech-english"].min_app = "18446744073709551615")],
    ["a Mac min_app part at the Int limit", (i) => (i.mac.cleanup.min_app = "9223372036854775807")],
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
 * outside public/ so the site never serves it:
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
 * and to the bytes where public/downloads still holds the installer, but
 * otherwise rest on the publishing tool, which measured them on the files it
 * downloaded back from the release.
 */
const RELEASES = new URL("../releases/", import.meta.url);
const GITHUB_DOWNLOAD = "https://github.com/vishutdhar/koegaki-releases/releases/download";
/** The Vercel Blob host the disk images and the updater's installers through 1.9.0 were served from. */
const BLOB_HOST = "npdal36mxz3kcwxv.public.blob.vercel-storage.com";
const ASSET_NAME = { dmg: (version) => `Koegaki-${version}.dmg`, exe: (version) => `Koegaki-${version}-setup.exe` };
/** The one url a GitHub release asset of this version and kind ("dmg" or "exe") is served from. */
const githubAssetUrl = (version, kind) => `${GITHUB_DOWNLOAD}/v${version}/${ASSET_NAME[kind](version)}`;
const RECORD_FIELDS = { dmg: ["url", "size", "sha256", "blake2b512"], exe: ["url", "size", "sha256", "blake2b512", "signature"] };
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The parsed releases/<version>.json, or undefined when there is none or the version could not name one. */
function releaseRecord(version) {
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) return undefined;
  const file = new URL(`${version}.json`, RELEASES);
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
  if (!isPlainObject(record.artifacts) || !sameKeys(record.artifacts, ["dmg", "exe"])) return [...problems, "artifacts is not exactly a dmg and an exe"];
  for (const [kind, fields] of Object.entries(RECORD_FIELDS)) {
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
  if (isPlainObject(record.artifacts.exe) && (typeof record.artifacts.exe.signature !== "string" || record.artifacts.exe.signature === "")) {
    problems.push("exe: signature is not a string");
  }
  return problems;
}

/** Every record in releases/, by version; a file named anything but <version>.json is reported under its name. */
function releaseRecords() {
  return readdirSync(RELEASES).map((name) => {
    const version = name.match(/^(\d+\.\d+\.\d+)\.json$/)?.[1];
    return { name, version, record: version && releaseRecord(version) };
  });
}

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

test("the release record check refuses a record that is malformed or names another release", () => {
  const record = releaseRecord("1.9.0");
  assert.ok(record, "releases/1.9.0.json, the record these cases start from, is missing");
  const refused = [
    ["another version", (r) => (r.version = "1.9.1"), /names version "1\.9\.1"/],
    ["an unknown top level key", (r) => (r.extra = 1), /the record holds/],
    ["a note that is not text", (r) => (r.note = 7), /note is not a string/],
    ["no dmg", (r) => delete r.artifacts.dmg, /artifacts is not exactly/],
    ["a third artifact", (r) => (r.artifacts.zip = {}), /artifacts is not exactly/],
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
  const problemsAfter = (mutate) => {
    const copy = structuredClone(record);
    mutate(copy);
    return releaseRecordProblems(copy, "1.9.0");
  };
  const missed = refused.filter(([, mutate, expected]) => !problemsAfter(mutate).some((p) => expected.test(p)));
  assert.deepEqual(missed.map(([name]) => name), [], "these passed the check");
  assert.deepEqual(problemsAfter(() => {}), [], "the record as committed was refused");
  assert.deepEqual(problemsAfter((r) => delete r.note), [], "a record with no note was refused");
});

/**
 * The Windows updater's public key, copied from the Koegaki repo
 * (apps/KoegakiWindows/src-tauri/tauri.conf.json, plugins.updater.pubkey). Every
 * installed Windows build checks an update against it, so a manifest that does
 * not verify here is an update no PC will install.
 */
const WINDOWS_UPDATER_PUBKEY =
  "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEVFQjY3RUQzRENFNDQ1OUEKUldTYVJlVGMwMzYyN2gxZS9nL2VjMmkyQU9RclhvT2t4MWQxeDZKa0FkYysvMUtGVGVTZGxYZFEK";

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
function updaterSignatureProblems(digest, signature, pubkey) {
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
  if (!verify(null, digest, publicKey, sig.subarray(10))) problems.push("the installer signature does not verify");
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
 * The BLAKE2b-512 digest of the installer the manifest's url serves, and what
 * stops it being known. A url on github.com must be exactly the release asset
 * of this version, of a release that did not ship from public/downloads, and
 * the digest is the one its record states, which the signature check then
 * holds to the signed installer. Otherwise the url must be on the Blob host,
 * where the updater fetched every installer shipped from this repository
 * through 1.9.0, so its bytes are read from public/downloads, and a record
 * never stands in for them.
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
  const manifest = publicJson("windows-updates.json");
  assert.deepEqual(windowsUpdateProblems(manifest, RELEASE_SOURCES, WINDOWS_UPDATER_PUBKEY), []);
  // The site's own download link serves the same release the updater offers,
  // and once it moves to GitHub, the same release asset.
  assert.ok(SITE.windowsDownloadUrl.endsWith(`/Koegaki-${manifest.version}-setup.exe`), `the download link does not name ${manifest.version}`);
  if (hostOf(SITE.windowsDownloadUrl) === "github.com") {
    assert.equal(SITE.windowsDownloadUrl, githubAssetUrl(manifest.version, "exe"), "the Windows download link is not the GitHub release asset");
    assert.ok(releaseRecord(manifest.version), `the Windows download link is on GitHub but no releases/${manifest.version}.json records that release`);
    assert.equal(frozenReleaseProblem(manifest.version, RELEASE_SOURCES), undefined, "the Windows download link names a GitHub release that does not exist");
  }
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

test("every release record states the installer digest its updater signature covers", () => {
  // The record of a release served from GitHub is the only copy of its digests
  // in this repository, so a digest changed by one byte must fail here even
  // where no manifest offers that release.
  for (const { name, version, record } of releaseRecords()) {
    assert.deepEqual(releaseRecordProblems(record, version), [], `releases/${name}`);
    const { blake2b512, signature } = record.artifacts.exe;
    const { problems, trusted } = updaterSignatureProblems(Buffer.from(blake2b512, "hex"), signature, WINDOWS_UPDATER_PUBKEY);
    assert.deepEqual(problems, [], `releases/${name}`);
    assert.ok(trusted?.split("\t").includes(`file:Koegaki_${version}_x64-setup.exe`), `releases/${name}: the trusted comment ${JSON.stringify(trusted)} names another file`);
  }
});

/** An appcast's markup without its comments and CDATA sections, whose text an XML reader never takes for elements. */
const appcastMarkup = (xml) => xml.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");

/** An enclosure tag, read whole even where a quoted attribute value holds a ">". */
const ENCLOSURE_TAG = /<enclosure\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;

/**
 * The attributes of one tag by name, each read where it starts, so text inside
 * another attribute's quoted value is never taken for an attribute; a name
 * given twice reads as null.
 */
function xmlAttributes(tag) {
  const attributes = new Map();
  for (const [, name, double, single] of tag.matchAll(/\s([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes.set(name, attributes.has(name) ? null : (double ?? single));
  }
  return attributes;
}

/**
 * Every enclosure in an appcast's items, with the short version of the item
 * that holds it, or null when the item does not hold exactly one.
 */
function appcastEnclosures(xml) {
  return [...appcastMarkup(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const versions = [...item.matchAll(/<sparkle:shortVersionString>([^<]*)<\/sparkle:shortVersionString>/g)].map((m) => m[1]);
    const version = versions.length === 1 ? versions[0] : null;
    return (item.match(ENCLOSURE_TAG) ?? []).map((tag) => {
      const attributes = xmlAttributes(tag);
      return { version, versions: versions.length, url: attributes.get("url"), length: attributes.get("length") };
    });
  });
}

/**
 * What is wrong with the disk images an appcast offers, given `sources` (see
 * windowsUpdateProblems). An enclosure on github.com must be exactly the
 * release asset of its item's version, of a release that did not ship from
 * public/downloads, and the length Sparkle is told must be the size that
 * release's record states. An enclosure on the Blob host, as every one was
 * through 1.9.0, is left as it is, and any other host is refused, so a
 * misspelled host cannot skip these checks. Sparkle's signature is over the
 * whole disk image, which is not here, so it is not checked.
 */
function appcastProblems(xml, sources) {
  const problems = [];
  const enclosures = appcastEnclosures(xml);
  // Every enclosure in the file is one checked below, so none escapes the
  // checks by sitting where the item pattern does not look.
  const stray = (appcastMarkup(xml).match(/<enclosure\b/g) ?? []).length - enclosures.length;
  if (stray !== 0) problems.push(`${stray} enclosure${stray === 1 ? "" : "s"} outside the items the check reads`);
  for (const { version, versions, url, length } of enclosures) {
    const at = `item ${version}`;
    if (version === null) problems.push(`an item holds ${versions} short versions, not one`);
    const host = hostOf(url);
    if (host !== "github.com") {
      if (host !== BLOB_HOST) problems.push(`${at}: the enclosure url ${url} is on neither github.com nor the Blob host ${BLOB_HOST}`);
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

/** An appcast of one item, laid out as Tools/make-appcast.sh writes it. */
const appcastOf = (version, url, length) => `<?xml version="1.0" standalone="yes"?>
<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle" version="2.0">
    <channel>
        <title>KoegakiMac</title>
        <item>
            <title>${version}</title>
            <sparkle:version>25</sparkle:version>
            <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
            <enclosure url="${url}" length="${length}" type="application/octet-stream" sparkle:edSignature="c2lnbmF0dXJl"/>
        </item>
    </channel>
</rss>
`;

test("the appcast offers a GitHub hosted disk image only at its release asset url, with the size its record states", () => {
  const xml = readFileSync(new URL("../public/appcast.xml", import.meta.url), "utf8");
  const enclosures = appcastEnclosures(xml);
  assert.ok(enclosures.length > 0 && enclosures.every((e) => e.version && e.url && e.length), `the appcast enclosures did not parse: ${JSON.stringify(enclosures)}`);
  assert.deepEqual(appcastProblems(xml, RELEASE_SOURCES), []);
  // The site's Mac download link, once it moves to GitHub, is the same asset.
  if (hostOf(SITE.downloadUrl) === "github.com") {
    const offered = enclosures.find((e) => SITE.downloadUrl === githubAssetUrl(e.version, "dmg"));
    assert.ok(offered, `the Mac download link ${SITE.downloadUrl} is not the GitHub release asset of a version the appcast offers`);
    assert.ok(releaseRecord(offered.version), `the Mac download link is on GitHub but no releases/${offered.version}.json records that release`);
    assert.equal(frozenReleaseProblem(offered.version, RELEASE_SOURCES), undefined, "the Mac download link names a GitHub release that does not exist");
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
    const { url = github, length = size, file, xml = appcastOf(version, url, length) } = change;
    const recorded = "record" in change ? change.record : record;
    return appcastProblems(xml, { installer: () => file, record: () => recorded });
  };
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
    ["the url given twice", { xml: appcastOf(version, github, size).replace("<enclosure ", `<enclosure url="${github}" `) }, /is on neither/],
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
  ];
  const accepted = [
    ["the release asset with its recorded size", {}],
    ["an item tag with an attribute", { xml: appcastOf(version, github, size).replace("<item>", '<item xml:lang="en">') }],
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

test("every download link is on GitHub, koegaki.com or the Blob host, and one on koegaki.com names a file this deployment serves", () => {
  // The GitHub links are held to their release elsewhere. From 1.9.1
  // public/downloads gains nothing, so a link left on koegaki.com when its
  // release moves to GitHub would serve a 404 there.
  for (const [what, link] of [["Mac", SITE.downloadUrl], ["Windows", SITE.windowsDownloadUrl]]) {
    const { host, pathname } = new URL(link);
    assert.ok(["github.com", "koegaki.com", BLOB_HOST].includes(host), `the ${what} download link ${link} is on ${host}, which serves no release`);
    if (host !== "koegaki.com") continue;
    assert.ok(existsSync(new URL(`../public${pathname}`, import.meta.url)), `the ${what} download link ${link} names no file in public/`);
  }
});
