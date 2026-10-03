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
      if (typeof e.min_app !== "string" || !/^[0-9]+(?:\.[0-9]+){0,2}$/.test(e.min_app)) {
        problems.push(`${at}: min_app ${JSON.stringify(e.min_app)} is not one to three numeric components`);
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
  ];
  for (const [name, mutate, expected] of mutations) {
    const copy = structuredClone(index);
    mutate(copy);
    const problems = modelIndexProblems(copy);
    assert.ok(problems.some((p) => expected.test(p)), `${name} passed the check: ${JSON.stringify(problems)}`);
  }
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
 * Check a Tauri updater signature as the updater does. It is a minisign
 * signature, base64 text whose second line is "ED" (prehashed Ed25519), the
 * 8 byte key id and the 64 byte signature of the installer's BLAKE2b-512
 * digest; the fourth line signs those 64 bytes followed by the trusted comment
 * (third line), which names the signed file. The key's second line is "Ed", the
 * same key id and the 32 byte key. Returns what failed and the trusted comment.
 */
function updaterSignatureProblems(file, signature, pubkey) {
  const lines = (text) => Buffer.from(text, "base64").toString("utf8").split("\n");
  const key = Buffer.from(lines(pubkey)[1] ?? "", "base64");
  const [, sigLine = "", trustedLine = "", globalLine = ""] = lines(signature);
  const sig = Buffer.from(sigLine, "base64");
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
  const global = Buffer.from(globalLine, "base64");
  if (trusted === undefined) problems.push("no trusted comment");
  else if (global.length !== 64 || !verify(null, Buffer.concat([sig.subarray(10), Buffer.from(trusted)]), publicKey, global)) {
    problems.push("the trusted comment signature does not verify");
  }
  return { problems, trusted };
}

/** The updater manifest, its installer from public/downloads, and its signature. */
function windowsUpdate() {
  const manifest = publicJson("windows-updates.json");
  const target = manifest.platforms?.["windows-x86_64"];
  const installer = readFileSync(new URL(`../public/downloads/Koegaki-${manifest.version}-setup.exe`, import.meta.url));
  return { manifest, target, installer };
}

test("the Windows updater manifest names the installer its signature covers", () => {
  const { manifest, target, installer } = windowsUpdate();
  const { version, pub_date: date } = manifest;
  assert.match(version, /^\d+\.\d+\.\d+$/, "version is not three numeric components");
  assert.match(date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, `pub_date ${date} is not RFC 3339`);
  assert.ok(!Number.isNaN(Date.parse(date)), `pub_date ${date} does not parse`);
  assert.ok(target, "no windows-x86_64 platform");
  assert.match(target.url, /^https:\/\//, "the installer url is not https");
  assert.ok(target.url.endsWith(`/Koegaki-${version}-setup.exe`), `the url ${target.url} does not name the ${version} installer`);
  // The site's own download link serves the same release the updater offers.
  assert.ok(SITE.windowsDownloadUrl.endsWith(`/Koegaki-${version}-setup.exe`), `the download link does not name ${version}`);
  const { problems, trusted } = updaterSignatureProblems(installer, target.signature, WINDOWS_UPDATER_PUBKEY);
  assert.deepEqual(problems, []);
  assert.ok(trusted.split("\t").includes(`file:Koegaki_${version}_x64-setup.exe`), `the trusted comment "${trusted}" names another file`);
});

test("the updater signature check refuses a changed signature, installer or trusted comment", () => {
  const { target, installer } = windowsUpdate();
  // Rewrite one line of the signature text, re-encoded as the manifest carries it.
  const withLine = (n, change) => {
    const lines = Buffer.from(target.signature, "base64").toString("utf8").split("\n");
    lines[n] = change(lines[n]);
    return Buffer.from(lines.join("\n")).toString("base64");
  };
  const flipped = (bytes, at) => {
    const copy = Buffer.from(bytes);
    copy[at] ^= 0x01;
    return copy;
  };
  const cases = [
    ["one signature byte", installer, withLine(1, (l) => flipped(Buffer.from(l, "base64"), 40).toString("base64")), /installer signature/],
    ["one installer byte", flipped(installer, Math.floor(installer.length / 2)), target.signature, /installer signature/],
    ["the signed file name", installer, withLine(2, (l) => l.replace(/file:\S+/, "file:Koegaki_0.0.1_x64-setup.exe")), /trusted comment/],
    ["the key id", installer, withLine(1, (l) => flipped(Buffer.from(l, "base64"), 2).toString("base64")), /key ids/],
  ];
  assert.deepEqual(updaterSignatureProblems(installer, target.signature, WINDOWS_UPDATER_PUBKEY).problems, []);
  for (const [name, file, signature, expected] of cases) {
    const { problems } = updaterSignatureProblems(file, signature, WINDOWS_UPDATER_PUBKEY);
    assert.ok(problems.some((p) => expected.test(p)), `a changed ${name} still verified: ${JSON.stringify(problems)}`);
  }
});
