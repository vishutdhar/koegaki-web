// Checks the BUILT site (the prerendered HTML and sitemap in .next), not the
// source, so what is pinned here is exactly what a crawler is served. Run with
// `npm test`, which builds first.
import { test } from "node:test";
import assert from "node:assert/strict";
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
  const wanted = [...LANDING_PAGES.map((p) => p.path), ...COMPARISONS.map((c) => `/vs/${c.slug}`)];
  for (const path of wanted) {
    const hit = links.find((l) => l.href === path);
    assert.ok(hit, `home footer does not link ${path}`);
    assert.ok(hit.text.split(/\s+/).length >= 2, `anchor text for ${path} is not descriptive: "${hit.text}"`);
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
  for (const e of entries) {
    const lastmod = e.match(/<lastmod>([^<]*)<\/lastmod>/);
    assert.ok(lastmod, `no lastmod in ${e.trim()}`);
    assert.match(lastmod[1], /^\d{4}-\d{2}-\d{2}/);
    assert.ok(!Number.isNaN(Date.parse(lastmod[1])), `unparseable lastmod ${lastmod[1]}`);
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
    assert.equal(app.name, SITE.name);
    assert.equal(app.operatingSystem, page.operatingSystem);
    assert.deepEqual(app.offers, home.offers);
    assert.equal(app.offers.price, "30");
    assert.equal(app.offers.priceCurrency, "USD");
    assert.equal(nodes.filter((n) => n["@type"] === "FAQPage").length, 1, `FAQPage count on ${page.path}`);
    assert.equal(nodes.filter((n) => n["@type"] === "BreadcrumbList").length, 1, `breadcrumb count on ${page.path}`);
  }
});

test("all JSON-LD parses and every @id reference resolves on the same page", () => {
  for (const path of ROUTES) {
    const text = JSON.stringify(jsonLd(html(path)));
    const defined = new Set([...text.matchAll(/"@id":"([^"]+)"/g)].map((m) => m[1]));
    for (const m of text.matchAll(/\{"@id":"([^"]+)"\}/g)) {
      assert.ok(defined.has(m[1]), `${path} references undefined @id ${m[1]}`);
    }
  }
});

test("the home H1 does not run the platform words together in extracted text", () => {
  const h1 = html("/").match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  const text = h1.replace(/<br[^>]*>/g, " ").replace(/<[^>]*>/g, "");
  assert.doesNotMatch(text, /MacPC/);
  assert.match(text, /Mac\s+PC/);
});
