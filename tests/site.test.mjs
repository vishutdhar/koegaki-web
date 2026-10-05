// Checks the BUILT site (the prerendered HTML and sitemap in .next), not the
// source, so what is pinned here is exactly what a crawler is served. Run with
// `npm test`, which builds first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
 * heading or summary is marked, and so is a table cell, and a block a
 * container ends after is marked closed), then the page's
 * description and social title meta tags, every string in its JSON-LD, and
 * every alt text and aria-label, which stand alone.
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
      // A container that ends after a block (a FAQ answer's details, a
      // section, a table) closes it, so nothing after it reads as its
      // continuation; a div is layout and a list runs on like paragraphs.
      if (/^<\/(?:details|section|article|table|header|footer|main|nav)\b/i.test(part) && blocks.length) {
        blocks[blocks.length - 1].closed = true;
      }
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
    ["property", "og:title"],
    ["name", "twitter:title"],
  ]) {
    for (const tag of headTags(doc, key, value)) standalone.push(decodeEntities(attr(tag, "content") ?? ""));
  }
  const walk = (v) => {
    if (typeof v === "string") standalone.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(jsonLd(doc));
  // Text alternatives and accessible labels are copy a screen reader reads.
  for (const [, value] of body.matchAll(/\s(?:alt|aria-label)="([^"]*)"/g)) standalone.push(decodeEntities(value));
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
 * Every sentence the site says about a download waiting on the connection,
 * reviewed against the Koegaki spec 2026-10-05-metered-connection-deferral and
 * both implementations, with the pages it may appear on and why it is true.
 *
 * What waits: the speech model an app update brings (with the repair it leaves
 * for the next launch on the Mac), and the cleanup model the app fetches at
 * launch for the style the user turned on. What goes ahead on any connection: a
 * download the user starts, the first download after an install, a set that will
 * not load, a repair of a damaged file of a megabyte or two, and the app update
 * itself. Which connections: a Mac waits while its path is expensive (cellular
 * or a Personal Hotspot, in Apple's own words) or constrained (Low Data Mode);
 * Windows waits on the cost it reports as metered (cellular by default, a network
 * the user set as metered, roaming, a data limit). Windows sets Wi-Fi unmetered
 * by default, so there a phone hotspot waits only once the user marks it metered.
 *
 * The check fails closed, the lesson of the custom words check above: a
 * sentence that aboutWaiting() flags passes only when listed here. A listed
 * sentence must appear on exactly the pages named, so a Mac sentence cannot land
 * on the Windows page and a sentence the site stops saying is dropped. A
 * sentence that leans on what comes before it ("That background download",
 * "they") lists in `after` the exact sentences that may come right before it,
 * so it cannot be moved after a different download or subject; one whose
 * subject is its own has `after` null. A sentence that claims a wait lists in
 * `then` the exact sentences that may come right after it, in its paragraph or
 * the next one of its section (END when a heading or the end of the page or of
 * its string follows), so a short continuation such as "The app update does
 * too." cannot carry the wait to another download. Every entry states `after`
 * and `then`, null where nothing is pinned, and an entry that claims a wait
 * (waits, pauses, is held, blocked, deferred) must list its `then`. A sentence
 * whose subject is the question it answers names that heading in `under`, and
 * must open the first paragraph under it (or the JSON-LD answer to it). An honest sentence the check flags for another
 * reason is reviewed and listed too.
 */
const MAC_WAIT =
  "That background download waits while your Mac is on a connection it treats as costly, such as an iPhone's Personal Hotspot or a network with Low Data Mode turned on.";
const WINDOWS_WAIT =
  "That background download waits while your PC is on a connection Windows treats as metered, such as a cellular link or a network you have set as metered, which you can do for a phone hotspot.";
const BOTH_WAIT =
  "That background download waits while your computer is on a connection it treats as costly, such as an iPhone's Personal Hotspot on a Mac or a network you have set as metered in Windows.";
/** The sentences that name the background speech update, any of which the short wait sentence may follow. */
const SPEECH_UPDATE = [
  "When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps working.",
  "When an app update brings a new speech model, that model downloads once, in the background, while the current one keeps transcribing.",
  "The app does go online for a few things that carry no audio and no text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a daily check for new app versions and newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working.",
  "A few things, none of them involving audio or text: the speech model download on first launch, activating a licence key and a quiet daily licence check, a daily check with koegaki.com for new app versions and newer models, the download of an update or a model when you choose one, and the background download of a new speech model when an app update brings one, while the current model keeps working.",
].map((sentence) => [sentence]);
const PRIVACY_UPDATE =
  "When an update brings a new version of the speech model you use, the updated app downloads it automatically in the background from our model mirror, a download of several hundred megabytes, and you keep dictating on your current model until the new one is ready.";
const PRIVACY_REQUEST =
  "That download is a plain request for the model files, carries nothing about you or your dictations, and uses only the internet connection you already have.";
const PRIVACY_WAIT =
  "That download, and the download of a cleanup model you turned on when the app has to fetch it at launch, waits while your computer is on a connection it treats as costly, and starts by itself once you are back on an ordinary connection.";
const COSTLY_EXAMPLES =
  "Costly connections include an iPhone's Personal Hotspot and Low Data Mode on a Mac, and in Windows a cellular link and any network you marked as metered, which you can do for a phone hotspot.";
const EACH_MODEL_ONCE = "Each model downloads once, and a cleanup model downloads only when you choose it.";
/** What `then` names when a heading, or the end of the page or of a string, follows. */
const END = "(the end of the block)";
/** What follows the Mac wait sentence in its section on /mac, to the end of the section. */
const MAC_SECTION_REST = [
  "Your audio and the text it becomes are never uploaded, never stored on a server, and never seen by us.",
  "That is the whole reason the app exists.",
  "Most dictation apps send your voice to a server because that is the easy way to build one.",
  "Apple Silicon is fast enough that it no longer has to be, and Koegaki uses the Neural Engine so transcription feels instant.",
  "A multilingual speech model and an optional cleanup model are separate downloads, and they run on your Mac too.",
];
const REVIEWED_WAIT_SENTENCES = new Map([
  [MAC_WAIT, {
    rest: [
      MAC_SECTION_REST,
      ["Each model downloads once, and a cleanup model downloads only when you choose it.", "Being offline never locks a paid licence out."],
    ],
    where: ["/mac"],
    after: SPEECH_UPDATE,
    then: ["Your audio and the text it becomes are never uploaded, never stored on a server, and never seen by us.", EACH_MODEL_ONCE],
    why: "the speech update on the Mac waits on an expensive path (Personal Hotspot) or a constrained one (Low Data Mode)",
  }],
  [WINDOWS_WAIT, {
    rest: [
      ["Your audio and your text stay on your machine.", "Nothing is uploaded and there is no server on our side to upload to.", "The voice typing built into Windows sends your speech to Microsoft's servers to be recognised.", "Koegaki does the recognition locally, which is why it can be used on documents you would never paste into a website.", "A multilingual speech model and an optional cleanup model are separate downloads, and they run on your PC too."],
      ["Each model downloads once, and a cleanup model downloads only when you choose it.", "Being offline never locks a paid licence out."],
    ],
    where: ["/windows"],
    after: SPEECH_UPDATE,
    then: ["Your audio and your text stay on your machine.", EACH_MODEL_ONCE],
    why: "the speech update on Windows waits on the cost Windows reports; cellular is metered by default and Wi-Fi only once marked",
  }],
  [BOTH_WAIT, {
    rest: [
      ["Activating a license and a quiet daily license check use the network, but being offline never locks you out, and no audio or text is ever involved."],
      ["Each model downloads once, and a cleanup model downloads only when you choose it.", "If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline."],
      [],
    ],
    where: ["/", "/offline-dictation"],
    after: SPEECH_UPDATE,
    then: [
      "Activating a license and a quiet daily license check use the network, but being offline never locks you out, and no audio or text is ever involved.",
      EACH_MODEL_ONCE,
      END,
    ],
    why: "the same rule for both platforms, each example under its own OS",
  }],
  [PRIVACY_WAIT, {
    rest: [
      ["Costly connections include an iPhone's Personal Hotspot and Low Data Mode on a Mac, and in Windows a cellular link and any network you marked as metered, which you can do for a phone hotspot.", "A download you start yourself, and the first download after you install, go ahead on any connection.", "The license and update checks carry only license and version metadata; the update download is the app itself.", "None of this ever includes audio or transcripts."],
    ],
    where: ["/privacy"],
    after: [[PRIVACY_UPDATE, PRIVACY_REQUEST]],
    then: [COSTLY_EXAMPLES],
    why: "names exactly the two downloads that wait, not every download the app starts by itself",
  }],
  [COSTLY_EXAMPLES, {
    where: ["/privacy"],
    after: null,
    then: ["A download you start yourself, and the first download after you install, go ahead on any connection."],
    why: "each OS's own signal, and a Windows phone hotspot counts only once marked metered",
  }],
  ["A download you start yourself, and the first download after you install, go ahead on any connection.", {
    where: ["/privacy"],
    after: null,
    then: ["The license and update checks carry only license and version metadata; the update download is the app itself."],
    why: "a download the user starts and the first install have no gate on either platform",
  }],
  ["A newer cleanup model is offered on the Home screen, and nothing downloads until you choose to update it.", {
    where: ["/privacy"],
    after: null,
    then: ["A new speech model arrives only with an app update."],
    why: "a newer cleanup model is the user's to accept; the launch download is of the model already chosen",
  }],
  [PRIVACY_REQUEST, {
    where: ["/privacy"],
    after: [[PRIVACY_UPDATE]],
    then: [PRIVACY_WAIT],
    why: "what the background request carries; \"only\" is about the connection it uses, not when",
  }],
  ["A new speech model arrives only with an app update.", {
    where: ["/privacy"],
    after: null,
    then: [PRIVACY_UPDATE],
    why: "a speech model is never offered on its own; it comes with an app update",
  }],
  ["The license and update checks carry only license and version metadata; the update download is the app itself.", {
    where: ["/privacy"],
    after: null,
    then: ["None of this ever includes audio or transcripts."],
    why: "what the checks carry; no wait claimed",
  }],
  [PRIVACY_UPDATE, {
    where: ["/privacy"],
    after: [["A new speech model arrives only with an app update."]],
    then: [PRIVACY_REQUEST],
    why: "the background speech update itself; its wait is the sentence after next",
  }],
  [SPEECH_UPDATE[2][0], {
    where: ["/mac", "/windows"],
    after: [["Dictation itself never touches the network."]],
    then: [MAC_WAIT, WINDOWS_WAIT],
    why: "the network FAQ's list: what the user chooses, and the background speech update, with no wait claimed",
  }],
  [SPEECH_UPDATE[3][0], {
    where: ["/offline-dictation"],
    under: "What still uses the network",
    after: null,
    then: [BOTH_WAIT],
    why: "the same list on the offline page",
  }],
  [EACH_MODEL_ONCE, {
    where: ["/mac", "/windows", "/offline-dictation"],
    after: null,
    then: ["Being offline never locks a paid licence out.", "If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline."],
    why: "pre-existing: a cleanup model downloads only once the user chose it; \"once\" is the normal case, as a missing file is fetched again; no wait claimed",
  }],
  ["The app connects out only for licence activation and a daily licence check with Lemon Squeezy (our licensing provider), version and model checks with koegaki.com, and downloads of updates from our hosting storage, and model downloads: the list of available models comes from koegaki.com.", {
    where: ["/offline-dictation"],
    after: [["First launch needs to download a speech model and activation needs to reach our licensing provider, so those hosts must be allowed once."]],
    then: ["On Mac every model file comes from our model mirror at koegaki-models.vishutdhar.workers.dev and nowhere else."],
    why: "the hosts the app reaches, for a firewall allow list; \"only\" limits where, not when",
  }],
  ["That is why it needs an account and an internet connection, why the free tier is capped at a weekly word count on desktop with a paid plan above it, and why every sentence you dictate passes through a company's infrastructure.", {
    where: ["/vs/wispr-flow"],
    after: [["Wispr Flow is good at what it does, and what it does is send your voice to a server, recognise it there, tidy it with a language model, and send text back."]],
    then: ["Koegaki makes the opposite trade."],
    why: "about Wispr Flow's account and word cap, not about a Koegaki download",
  }],
  ["Activating a license and a quiet daily license check use the network, but being offline never locks you out, and no audio or text is ever involved.", {
    where: ["/"],
    after: null,
    then: [END],
    why: "the licence checks, which never lock an offline user out; no download claimed",
  }],
  ["Dictation itself never touches the network.", {
    where: ["/mac", "/windows"],
    after: null,
    then: [SPEECH_UPDATE[2][0]],
    why: "dictation runs on the computer; the downloads are named in the sentence after",
  }],
  ["The speech model is downloaded once, on first launch, and from then on the app never needs the network to turn speech into text.", {
    where: ["/offline-dictation"],
    after: null,
    then: [SPEECH_UPDATE[1][0]],
    why: "recognition never needs the network; the background update and its wait follow",
  }],
  ["An internet connection is required.", {
    where: ["/vs/windows-voice-typing"],
    after: [["On Microsoft's online speech service."]],
    then: [END],
    why: "the comparison cell for Windows voice typing, which runs on Microsoft's servers",
  }],
  ["Microsoft's own documentation says voice typing requires an internet connection because it uses online speech recognition.", {
    where: ["/vs/windows-voice-typing"],
    after: null,
    then: ["Koegaki works offline once its speech model has downloaded."],
    why: "about Windows voice typing, which names its subject",
  }],
  ["Does it need an internet connection?", {
    where: ["/mac"],
    after: null,
    then: [END],
    why: "a FAQ question; its answer is reviewed where it says anything about a download",
  }],
  ["First launch needs to download a speech model and activation needs to reach our licensing provider, so those hosts must be allowed once.", {
    where: ["/offline-dictation"],
    after: null,
    then: ["The app connects out only for licence activation and a daily licence check with Lemon Squeezy (our licensing provider), version and model checks with koegaki.com, and downloads of updates from our hosting storage, and model downloads: the list of available models comes from koegaki.com."],
    why: "the hosts a firewall must allow once; names its subject, claims no wait",
  }],
  ["Once the speech model has downloaded, dictation needs no network.", {
    where: ["/vs/superwhisper", "/vs/windows-voice-typing", "/vs/wispr-flow"],
    after: null,
    then: [END],
    why: "Koegaki's offline cell in the comparison tables; dictation needs no network, no wait claimed",
  }],
  ["Dictation itself needs no internet connection at all.", {
    where: ["/privacy"],
    after: null,
    then: ["Beyond that, the app talks to the network to verify your license key (at activation, then a quiet daily check while licensed), to check koegaki.com for new versions, and, when an update installs, to download the new app package from our hosting storage."],
    why: "dictation is local; the network uses follow, none claimed to wait",
  }],
  ["A home connection that drops.", {
    where: ["/offline-dictation"],
    after: null,
    then: ["In every case Koegaki keeps typing what you say."],
    why: "a place offline dictation matters; no download claimed",
  }],
  ["Lose the connection and they stop.", {
    where: ["/offline-dictation"],
    after: [[
      "Most dictation tools are a microphone connected to a server.",
      "They record you, upload the audio, and wait for a transcript to come back.",
    ]],
    then: ["Keep the connection and every word you say passes through someone else's computer."],
    why: "about server dictation tools, which stop without a connection, not about a Koegaki download",
  }],
]);

/**
 * Whether a sentence speaks of a costly connection, or of a download, model,
 * update or connection being made to wait. A word list cannot see every
 * wording, so it is wide on purpose and an honest sentence it flags is
 * reviewed into REVIEWED_WAIT_SENTENCES. A sentence about the downloads a user
 * starts, or one that carries a rule over from another, is flagged too, since a
 * wait claimed for either is the likeliest overclaim. "Later" after a version or
 * a chip ("macOS 14 or later", "M1 and later") is a requirement, not a wait.
 */
function aboutWaiting(sentence) {
  const costly =
    /\b(?:costly|expensive|constrained|metered|unmetered|hotspots?|tether\w*|phones?|mobile|low data mode|cellular|roaming|data (?:limit|plan|cap|allowance|usage)s?|allowances?|bandwidth|ordinary connection|home (?:networks?|connections?)|wi-?fi)\b/i;
  const waiting =
    /\b(?:wait\w*|paus\w*|on hold|held|hold(?:s|ing)? (?:back|off)|block(?:s|ed|ing)?|suspend\w*|defer\w*|postpon\w*|delay\w*|resum\w*|stop|stops|stopped|stopping|until|(?<!\b(?:M\d+|\d+(?:\.\d+)*) (?:or|and) )later|queue\w*|skip\w*|go(?:es)? ahead|proceed\w*|only|(?:un)?limited|(?:un)?capped|requir\w*|(?:un)?restrict\w*|immediately|instantly|promptly|right away|at once)\b/i;
  // A promise about data or money ("never cost you extra"), next to a download
  // or a connection rather than a model, which the comparison pages name freely.
  const promise =
    /\b(?:never|extra|charges?|bill\w*|fees?|surprise\w*|budget\w*|spares?|spared|incur\w*|costs?|additional|eat(?:s|ing)? (?:into|up)|use(?:s|d)? up|won't|cannot|can't|balance|affect\w*|avoid\w*|needs?|needed|consum\w*|prepaid|zero bytes)\b/i;
  const transferOrData = /\b(?:download\w*|connection\w*|network\w*|data)\b/i;
  // A sentence that carries a wait over from another ("the same rule
  // applies"), speaks of every download at once, or speaks of the downloads a
  // user starts, which never wait.
  const carried =
    /\b(?:(?:same|this|that|these) rules?|also appl\w*|appl\w* (?:too|as well|equally)|likewise|the same goes|(?:any|every|all|each)\s+(?:\S+\s+){0,2}?downloads?)\b/i;
  const userStarted =
    /\byou (?:start|started|choose|chose|pick|picked|select|selected|click|clicked|accept|accepted|turn(?:ed)? on|ask for|asked for)\b|\b(?:manual\w*|user[- ]initiated|on demand)\b/i;
  const transfer = /\b(?:download\w*|connection\w*|network\w*|models?|updates?|transfer\w*|fetch\w*)\b/i;
  return (
    costly.test(sentence) ||
    carried.test(sentence) ||
    ((waiting.test(sentence) || userStarted.test(sentence)) && transfer.test(sentence)) ||
    (promise.test(sentence) && transferOrData.test(sentence))
  );
}

/**
 * What is wrong with what a page says about waiting: each flagged sentence of
 * every block, from the body and from what stands alone (meta and JSON-LD),
 * that is unreviewed, or reviewed but not right after one of its `after`
 * sequences or not right before one of its `then` sentences. With the reviewed
 * sentences found, for the where check.
 */
/**
 * A page's text as it reads: each block with the sentences of its run before
 * it (`before`), the first sentence of its run after it (`next`, END when none),
 * the rest of its run (`rest`), and the heading it sits under. A paragraph runs
 * on into the next one of its section, so neither a continuation nor an
 * antecedent hides behind a paragraph break; a heading, a table cell, the end
 * of a container (a FAQ answer, a section) or of the page ends the run. A
 * string that stands alone is its own run, and a JSON-LD answer sits under its
 * question.
 */
function readingBlocks(doc) {
  const { body, standalone } = textBlocks(doc);
  const runsOn = (a, b) => !a.closed && !a.cell && !a.heading && !b.heading && !b.cell;
  const blocks = [];
  let heading = null;
  let sinceHeading = 0;
  let run = [];
  body.forEach((b, k) => {
    if (k === 0 || !runsOn(body[k - 1], b)) run = [];
    // The FAQ marks each question with a "+" it draws, not part of the question.
    const text = b.heading ? b.text.replace(/\s*\+$/, "") : b.text;
    if (b.heading) {
      heading = text;
      sinceHeading = 0;
    } else {
      sinceHeading += 1;
    }
    const rest = [];
    for (let j = k; j + 1 < body.length && runsOn(body[j], body[j + 1]); j++) rest.push(...sentencesOf(body[j + 1].text));
    blocks.push({
      text,
      body: true,
      before: run,
      next: rest[0] ?? END,
      rest,
      heading,
      firstUnderHeading: !b.heading && sinceHeading === 1,
    });
    run = [...run, ...sentencesOf(b.text)];
    if (b.closed) heading = null;
  });
  const questionOf = new Map();
  const walkQuestions = (v) => {
    if (!v || typeof v !== "object") return;
    if (v["@type"] === "Question" && typeof v.acceptedAnswer?.text === "string") questionOf.set(v.acceptedAnswer.text, v.name);
    Object.values(v).forEach(walkQuestions);
  };
  jsonLd(doc).forEach(walkQuestions);
  for (const text of standalone) {
    const question = questionOf.get(text) ?? null;
    blocks.push({ text, body: false, before: [], next: END, rest: [], heading: question, firstUnderHeading: question !== null });
  }
  return blocks;
}

/**
 * What is wrong with what a page says about waiting: each flagged sentence of
 * every block that is unreviewed, or reviewed but not where it was reviewed to
 * be (after one of its `after` sequences, before one of its `then` sentences,
 * opening the answer to its `under` heading). With the reviewed sentences
 * found, for the where check.
 */
function waitProblems(doc, reviewed = REVIEWED_WAIT_SENTENCES) {
  const problems = [];
  const found = [];
  for (const { text, before, next, rest, heading: under, firstUnderHeading } of readingBlocks(doc)) {
    const sentences = sentencesOf(text);
    const context = [...before, ...sentences];
    sentences.forEach((sentence, i) => {
      if (!aboutWaiting(sentence)) return;
      const entry = reviewed.get(sentence);
      if (!entry) {
        problems.push(`says something unreviewed about a download waiting: "${sentence}"`);
        return;
      }
      found.push(sentence);
      // An answer to a heading opens the first paragraph under it.
      if (entry.under && (entry.under !== under || !firstUnderHeading || i !== 0)) {
        problems.push(`"${sentence}" does not open the answer to the heading it was reviewed under: "${under}"`);
      }
      const following = i + 1 < sentences.length ? sentences[i + 1] : next;
      if (!entry.then.includes(following)) {
        problems.push(`"${sentence}" is followed by a sentence it was not reviewed with: "${following}"`);
      }
      // A wait claim pins the whole rest of its run, so a continuation two
      // sentences on cannot carry the wait to another download either.
      if (entry.rest) {
        const remainder = [...sentences.slice(i + 1), ...rest];
        if (!entry.rest.some((seq) => seq.length === remainder.length && seq.every((r, k) => r === remainder[k]))) {
          problems.push(`"${sentence}" is followed by a passage it was not reviewed with: ${JSON.stringify(remainder)}`);
        }
      }
      if (entry.after === null) return;
      const at = before.length + i;
      const follows = entry.after.some(
        (seq) => at >= seq.length && seq.every((b, k) => context[at - seq.length + k] === b),
      );
      if (!follows) problems.push(`"${sentence}" does not come right after a sentence it was reviewed to follow: "${context[at - 1] ?? ""}"`);
    });
  }
  return { problems, found };
}

/**
 * Blocks that describe the background speech download with no reviewed wait
 * sentence anywhere in their run, and the page parts ("body", "JSON-LD") that
 * describe it, for the coverage check.
 */
function backgroundCoverage(doc) {
  const missing = [];
  const described = new Set();
  for (const { text, body, before, rest } of readingBlocks(doc)) {
    if (!/\bbackground\b/i.test(text) || !/\bdownloads?\b/i.test(text)) continue;
    described.add(body ? "body" : "JSON-LD");
    const says = [...before, ...sentencesOf(text), ...rest].some(
      (s) => /^That (?:background )?download\b/.test(s) && REVIEWED_WAIT_SENTENCES.has(s),
    );
    if (!says) missing.push(text);
  }
  return { missing, described };
}

test("every block that describes the background model download says when it waits", () => {
  // The speech model an app update brings downloads in the background, and it
  // waits while the computer is on a connection it treats as costly. A
  // paragraph, FAQ answer or JSON-LD string that describes the background
  // download with no wait in its run tells a visitor on a hotspot that several
  // hundred megabytes go ahead. Each JSON-LD string is judged alone, so a FAQ's
  // JSON-LD answer cannot drift from the visible one.
  const described = [];
  for (const path of ROUTES) {
    const coverage = backgroundCoverage(html(path));
    assert.deepEqual(coverage.missing, [], `${path} describes the background download without its wait`);
    for (const where of coverage.described) described.push(`${path} ${where}`);
  }
  // Where the background download is described today: the privacy page, the
  // home FAQ, and each landing page's prose and network FAQ, each FAQ in its
  // JSON-LD too. A check that finds none of them checks nothing; how many
  // paragraphs say it is the copy's business.
  assert.deepEqual(described.sort(), [
    "/ JSON-LD",
    "/ body",
    "/mac JSON-LD",
    "/mac body",
    "/offline-dictation body",
    "/privacy body",
    "/windows JSON-LD",
    "/windows body",
  ]);
});

/**
 * Entries that leave `after` unstated or pin nothing after them. Every reviewed
 * sentence pins what follows it, since a continuation can carry any claim on
 * ("The speech model has the same approval step."), whatever the claim's words.
 */
function ledgerProblems(reviewed = REVIEWED_WAIT_SENTENCES) {
  const claimsWait = /\b(?:wait\w*|paus\w*|held|on hold|hold(?:s|ing)? (?:back|off)|block(?:s|ed|ing)?|suspend\w*|defer\w*|postpon\w*|delay\w*)\b/i;
  return [...reviewed].flatMap(([sentence, entry]) => [
    ...(claimsWait.test(sentence) && !Array.isArray(entry.rest) ? [`claims a wait without pinning the rest of its passage: "${sentence}"`] : []),
    ...(!("after" in entry) || !("then" in entry) ? [`states no after or then: "${sentence}"`] : []),
    ...(!Array.isArray(entry.then) ? [`pins nothing after it: "${sentence}"`] : []),
  ]);
}

test("every sentence about a download waiting is one reviewed, after the sentence it leans on, on the pages it was reviewed for", () => {
  assert.deepEqual(ledgerProblems(), []);
  const seen = new Map();
  for (const path of ROUTES) {
    const { problems, found } = waitProblems(html(path));
    assert.deepEqual(problems, [], `${path} misdescribes when a download waits`);
    for (const sentence of found) seen.set(sentence, new Set([...(seen.get(sentence) ?? []), path]));
  }
  for (const [sentence, { where }] of REVIEWED_WAIT_SENTENCES) {
    assert.deepEqual([...(seen.get(sentence) ?? [])].sort(), [...where].sort(), `pages that say "${sentence}"`);
  }
});

test("the wait check refuses each overclaim it is known to have to catch", () => {
  // Each a block a page must never say: every automatic download waits (a
  // small repair and a set that will not load go ahead), a download the user
  // starts waits, the update waits, the first install waits, a Windows phone
  // hotspot waits unmarked, Low Data Mode on Windows, a reviewed "That
  // background download" sentence after a download that is not the background
  // speech update, or a reviewed sentence moved after a subject it was not
  // reviewed for. A wording found to slip past is added here first.
  for (const wrong of [
    "All automatic model downloads wait on a phone hotspot.",
    "That download, and any model download you did not start yourself, waits while your computer is on a connection it treats as costly.",
    "A download you start yourself waits while your computer is on a phone hotspot or another connection it treats as costly.",
    "The app update download pauses on a phone hotspot.",
    "The first download after you install is held until you are back on an ordinary connection.",
    "That download waits while your PC is on a phone hotspot or another connection it treats as metered.",
    "That download waits while your PC is in Low Data Mode.",
    "Every download stops on an expensive connection.",
    "The model you select waits until Wi-Fi is available.",
    `You can download app updates from Settings. ${BOTH_WAIT}`,
    `You can download app updates from Settings. That download is quick. ${BOTH_WAIT}`,
    `${MAC_WAIT}`,
    `When an app update brings a new speech model, you can download the app update in the background from Settings. ${MAC_WAIT}`,
    `${SPEECH_UPDATE[0][0]} That download also has a manual alternative: the speech model download you start from Settings. ${MAC_WAIT}`,
    "Koegaki puts all automatic downloads on hold when you use your phone for internet access.",
    "Koegaki downloads models now on your home connection, or later if you are using your phone for internet access.",
    "Koegaki downloads models immediately at home, and later when you are using your phone for internet access.",
    "Koegaki runs speech and cleanup models on your computer. Lose the connection and they stop.",
    `${SPEECH_UPDATE[0][0]} ${MAC_WAIT} The same rule applies to downloads you start yourself.`,
    "The same rule applies to downloads you start yourself.",
    "All model downloads are blocked on mobile connections.",
    "Downloads you start yourself wait too.",
    "Every download is suspended while you are away from home.",
    `${SPEECH_UPDATE[0][0]} ${MAC_WAIT} The app update does too.`,
    `${SPEECH_UPDATE[0][0]} ${MAC_WAIT} This covers every automatic download.`,
    "This covers every automatic download.",
    `${PRIVACY_UPDATE} ${PRIVACY_REQUEST} ${PRIVACY_WAIT} So does the app update.`,
    `${SPEECH_UPDATE[1][0]} ${BOTH_WAIT}</p><p>The app update does too.`,
    "Koegaki only downloads models on an unlimited connection.",
    "Model downloads never use your data allowance.",
    "Model downloads never use up your data.",
    "Model downloads never cost you extra.",
    `<ul><li>${SPEECH_UPDATE[1][0]} ${BOTH_WAIT}</li><li>The app update does too.</li></ul>`,
    `</p><h2>What waits?</h2><p>${SPEECH_UPDATE[3][0]}`,
    `Wispr Flow is good at what it does, and what it does is send your voice to a server, recognise it there, tidy it with a language model, and send text back. ${SPEECH_UPDATE[2][0]}`,
    `Wispr Flow is good at what it does, and what it does is send your voice to a server, recognise it there, tidy it with a language model, and send text back. ${PRIVACY_UPDATE}`,
    `</p><h2>What still uses the network</h2><p>What is held back?</p><p>${SPEECH_UPDATE[3][0]}`,
    `<img alt="All downloads wait on metered connections."/>`,
    `<button aria-label="All downloads wait on metered connections.">Download</button>`,
    "Model downloads spare your data.",
    "Downloads respect your connection budget.",
    "Downloads are free of surprise fees.",
    "A newer cleanup model is offered on the Home screen, and nothing downloads until you choose to update it. The speech model has the same approval step.",
    "Model downloads cannot incur additional costs.",
    "Model downloads won't eat into your data.",
    "Model downloads require an unrestricted connection.",
    "Downloading models does not affect your data balance.",
    "App updates are restricted to home networks.",
    "Model downloads need a home connection.",
    "Model downloads avoid using your data.",
    "Background model downloads start immediately on any connection.",
    "Model downloads use home networks exclusively.",
    "Model downloads do not consume your monthly data.",
    "Model downloads begin promptly on any connection.",
    "Model downloads use zero bytes from your prepaid bundle.",
    `${SPEECH_UPDATE[0][0]} ${MAC_WAIT} ${MAC_SECTION_REST.join(" ")} The app update follows that schedule too.`,
    "Koegaki makes the opposite trade. That is why it needs an account and an internet connection, why the free tier is capped at a weekly word count on desktop with a paid plan above it, and why every sentence you dictate passes through a company's infrastructure.",
    `When an update brings a new version of the speech model you use, the updated app downloads it automatically in the background. On a Mac, that includes an iPhone's Personal Hotspot and Low Data Mode; in Windows, a cellular link and any network you marked as metered, which you can do for a phone hotspot.`,
  ]) {
    // In the body, and, for plain text, standing alone in a social title (a
    // fixture with markup cannot sit inside an attribute).
    const docs = [`<html><head></head><body><main><p>${wrong}</p></main></body></html>`];
    if (!wrong.includes("<")) {
      docs.push(`<html><head><meta property="og:title" content="${wrong.replace(/"/g, "&quot;")}"/></head><body></body></html>`);
    }
    for (const doc of docs) {
      assert.notDeepEqual(waitProblems(doc).problems, [], `the wait check let through: "${wrong}"`);
    }
  }
  // A wait entry that leaves its followers unstated is refused too, however it
  // words the wait.
  const unpinned = new Map(REVIEWED_WAIT_SENTENCES);
  const withoutThen = { ...unpinned.get(MAC_WAIT) };
  delete withoutThen.then;
  unpinned.set(MAC_WAIT, withoutThen);
  assert.notDeepEqual(ledgerProblems(unpinned), [], "a wait entry with no then passed");
  const pauses = new Map([["The background speech update pauses on costly connections.", { where: ["/"], after: null, then: null }]]);
  assert.notDeepEqual(ledgerProblems(pauses), [], "a pause entry with no then passed");
  // Honest copy that names a download without any wait passes untouched.
  for (const fine of [
    "Download Koegaki with a one-time payment and no monthly subscription.",
    "The downloaded speech model runs exclusively on your computer.",
  ]) {
    const doc = `<html><head></head><body><main><p>${fine}</p></main></body></html>`;
    assert.deepEqual(waitProblems(doc).problems, [], `the wait check refused honest copy: ${fine}`);
  }
  // Honest layouts pass: the reviewed sentences split across two paragraphs,
  // and the answer to a question in JSON-LD.
  for (const fine of [
    `<p>${SPEECH_UPDATE[0][0]}</p><p>${MAC_WAIT} ${MAC_SECTION_REST.join(" ")}</p>`,
    `<h2>What still uses the network</h2><p>${SPEECH_UPDATE[3][0]} ${BOTH_WAIT} ${EACH_MODEL_ONCE} If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline.</p>`,
    // The FAQ draws a "+" beside each question; the answer is still under it.
    `<details><summary>What still uses the network<span>+</span></summary><p>${SPEECH_UPDATE[3][0]} ${BOTH_WAIT} ${EACH_MODEL_ONCE} If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline.</p></details>`,
  ]) {
    const doc = `<html><head></head><body><main>${fine}</main></body></html>`;
    assert.deepEqual(waitProblems(doc).problems, [], `the wait check refused honest copy: ${fine}`);
  }
  const faq = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "What still uses the network", acceptedAnswer: { "@type": "Answer", text: `${SPEECH_UPDATE[3][0]} ${BOTH_WAIT} ${EACH_MODEL_ONCE} If you are offline when a check would run, nothing happens; a paid licence is never revoked for being offline.` } }] });
  const faqDoc = `<html><head></head><body><script type="application/ld+json">${faq}</script></body></html>`;
  assert.deepEqual(waitProblems(faqDoc).problems, [], "the wait check refused a JSON-LD answer under its question");
  // The coverage check reads the same runs, so a split paragraph keeps its wait.
  const split = `<html><head></head><body><main><p>${SPEECH_UPDATE[0][0]}</p><p>${MAC_WAIT} ${MAC_SECTION_REST.join(" ")}</p></main></body></html>`;
  assert.deepEqual(backgroundCoverage(split).missing, [], "the coverage check refused a split paragraph");
  assert.deepEqual([...backgroundCoverage(split).described], ["body"]);
  const later = `<html><head></head><body><main><p>${SPEECH_UPDATE[0][0]} ${MAC_WAIT} ${MAC_SECTION_REST.join(" ")}</p><p>The background download comes from our model mirror.</p></main></body></html>`;
  assert.deepEqual(backgroundCoverage(later).missing, [], "the coverage check refused a later description of the same download");
  const lost = `<html><head></head><body><main><p>${SPEECH_UPDATE[0][0]}</p></main></body></html>`;
  assert.notDeepEqual(backgroundCoverage(lost).missing, [], "the coverage check missed a background download with no wait");
  // A wait sentence that ends a table cell or a FAQ answer is not continued by
  // the next cell or what follows the answer.
  for (const fine of [
    `<table><tr><td>${SPEECH_UPDATE[1][0]} ${BOTH_WAIT}</td><td>Downloads start immediately.</td></tr></table>`,
    `<details><summary>Does it need the internet?</summary><p>${SPEECH_UPDATE[1][0]} ${BOTH_WAIT}</p></details><p>Try Koegaki today.</p>`,
  ]) {
    const doc = `<html><head></head><body><main>${fine}</main></body></html>`;
    const continued = waitProblems(doc).problems.filter((p) => p.includes("is followed by"));
    assert.deepEqual(continued, [], `the wait check ran across a boundary in: ${fine}`);
  }
  // And it passes the block the site says.
  const right = `<html><head></head><body><main><p>${SPEECH_UPDATE[0][0]} ${MAC_WAIT} ${MAC_SECTION_REST.join(" ")}</p></main></body></html>`;
  assert.deepEqual(waitProblems(right).problems, []);
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
 * same key id and the 32 byte key. Returns what failed and the trusted comment.
 */
function updaterSignatureProblems(file, signature, pubkey) {
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
  const digest = createHash("blake2b512").update(file).digest();
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

/**
 * What the Windows updater would refuse in this manifest for this installer.
 * It deserializes the whole manifest before it picks its own platform (the
 * RemoteRelease deserializer in tauri-plugin-updater 2.10.1): every platform
 * entry must be an object with a parseable url and a string signature, or no
 * platform updates. Publication asks a little more than the reader: notes and
 * pub_date are present strings, and version is a bare SemVer core, three parts
 * with no leading zero, each within u64, and no prerelease or build suffix.
 */
function windowsUpdateProblems(manifest, installer, pubkey) {
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
  const urlProblem = updaterUrlProblem(target.url, version);
  if (urlProblem) problems.push(urlProblem);
  const { problems: signatureProblems, trusted } = updaterSignatureProblems(installer, target.signature, pubkey);
  problems.push(...signatureProblems);
  if (!trusted?.split("\t").includes(`file:Koegaki_${version}_x64-setup.exe`)) {
    problems.push(`the trusted comment ${JSON.stringify(trusted)} does not name Koegaki_${version}_x64-setup.exe`);
  }
  return problems;
}

/** The updater manifest and the installer in public/downloads it names. */
function windowsUpdate() {
  const manifest = publicJson("windows-updates.json");
  const installer = readFileSync(new URL(`../public/downloads/Koegaki-${manifest.version}-setup.exe`, import.meta.url));
  return { manifest, installer };
}

test("the Windows updater manifest names the installer its signature covers", () => {
  const { manifest, installer } = windowsUpdate();
  assert.deepEqual(windowsUpdateProblems(manifest, installer, WINDOWS_UPDATER_PUBKEY), []);
  // The site's own download link serves the same release the updater offers.
  assert.ok(SITE.windowsDownloadUrl.endsWith(`/Koegaki-${manifest.version}-setup.exe`), `the download link does not name ${manifest.version}`);
});

test("the updater manifest check refuses a damaged manifest, signature, installer or key", () => {
  const { manifest, installer } = windowsUpdate();
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
  const check = ({ sig = signature, href = url, date, release = version, file = installer, key = WINDOWS_UPDATER_PUBKEY, edit }) => {
    const copy = structuredClone(manifest);
    Object.assign(copy.platforms["windows-x86_64"], { signature: sig, url: href });
    copy.version = release;
    if (date !== undefined) copy.pub_date = date;
    edit?.(copy);
    return windowsUpdateProblems(copy, file, key);
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
  ];
  const accepted = [
    ["the manifest as published", {}],
    ["the signature text with CRLF line ends", { sig: encoded(decoded(signature), "\r\n") }],
    ["a pub_date with an offset", { date: "2026-10-03T17:26:44+02:00" }],
    ["another well formed platform", { edit: (m) => (m.platforms["darwin-aarch64"] = { url: "https://example.com/Koegaki.app.tar.gz", signature: "x" }) }],
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
