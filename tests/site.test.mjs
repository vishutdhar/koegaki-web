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
  return [...doc.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
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
  }
});

/**
 * What a page says about custom words that the app does not do (Koegaki spec
 * 2026-10-04). A custom word changes how a run of words the recognizer already
 * heard is written, never what Koegaki hears (item 2), and recognizer biasing
 * is out of that spec's scope, so the site may not say the app learns, is
 * trained or taught, is biased toward, recognises or better understands them,
 * or that they fix any misspelling; the copy says "hears" and "written" for
 * what does and does not change.
 */
function customWordsProblems(doc) {
  const recognitionClaim = /\b(?:learn|train|teach|bias|recogni[sz]|accura|understand|unknown|misspell)/i;
  const absenceClaim = /\b(?:unavailable|not available|no longer|removed|coming soon|not yet)\b/i;
  return customWordsMentions(doc).flatMap((block) => [
    ...(recognitionClaim.test(block) ? [`describes custom words as recognition: "${block}"`] : []),
    ...(absenceClaim.test(block) ? [`describes custom words as absent: "${block}"`] : []),
  ]);
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
 * Every block of text on a page a visitor or a crawler reads: each paragraph,
 * list item, table cell, heading and FAQ summary of the body, the page's
 * description meta tags, and every string in its JSON-LD. A claim is judged
 * with the rest of its block, so a sentence cannot escape the check by
 * following the one that names the feature.
 */
function textBlocks(doc) {
  const body = doc.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ");
  const blocks = body
    .split(/<\/?(?:p|li|td|th|h[1-6]|summary|details|div|section|article|header|footer|main|nav|ul|ol|table|tr|thead|tbody|dl|dt|dd|title)\b[^>]*>/i)
    .map((piece) => decodeEntities(piece.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
  for (const [key, value] of [
    ["name", "description"],
    ["property", "og:description"],
    ["name", "twitter:description"],
  ]) {
    for (const tag of headTags(doc, key, value)) blocks.push(decodeEntities(attr(tag, "content") ?? ""));
  }
  const walk = (v) => {
    if (typeof v === "string") blocks.push(v);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(jsonLd(doc));
  return blocks.filter(Boolean);
}

/** Every block of a page that names custom words. */
function customWordsMentions(doc) {
  return textBlocks(doc).filter((block) => /\bcustom words?\b/i.test(block));
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
  ];
  for (const doc of honest) assert.deepEqual(customWordsProblems(doc), []);
  assert.ok(customWordsMentions(page("<p>Custom words, spelled your way.</p>")).length > 0);
});

test("custom words are described as a spelling rule, never as recognition or as absent", () => {
  let described = 0;
  for (const path of ROUTES) {
    const doc = html(path);
    described += customWordsMentions(doc).length;
    assert.deepEqual(customWordsProblems(doc), [], `${path} misdescribes custom words`);
  }
  assert.ok(described > 0, "no page describes custom words");
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
