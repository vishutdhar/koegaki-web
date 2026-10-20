// Checks the step Vercel runs before every build (scripts/check-release-downloads.mjs).
// public/downloads served the Windows installers through 1.9.0 as static
// files, and every production deployment carried all of them; they are now
// assets of the windows-archive release, which koegaki.com/downloads/<name>
// redirects to (next.config.ts), so the step fails a build that has anything
// at all under public/downloads. It also holds the installer
// public/windows-updates.json offers to exactly the asset of a GitHub release
// of its own, whose record in releases/ is whole and carries the manifest's
// signature. Every case runs in a throwaway copy of the repository's shape,
// never the real public/; the real repository is checked last, with how
// Vercel runs the step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReleaseDownloads } from "../scripts/check-release-downloads.mjs";
import { ARCHIVE_DOWNLOAD, WINDOWS_ARCHIVE } from "../scripts/windows-archive.mjs";

/** Installer bytes of the given size; a Windows executable starts with "MZ". */
const installer = (size) => Buffer.concat([Buffer.from("MZ"), Buffer.alloc(size - 2)]);

// A manifest offering 1.2.0 from GitHub, and the record the publishing tool
// writes for it, with made up sizes and digests of the right shape.
const GITHUB_URL = "https://github.com/vishutdhar/koegaki-releases/releases/download/v1.2.0/Koegaki-1.2.0-setup.exe";
const GITHUB_MANIFEST = { version: "1.2.0", platforms: { "windows-x86_64": { url: GITHUB_URL, signature: "signature" } } };
const GITHUB_RECORD = {
  version: "1.2.0",
  artifacts: {
    dmg: { url: GITHUB_URL.replace(/[^/]+$/, "Koegaki-1.2.0.dmg"), size: 3, sha256: "a".repeat(64), blake2b512: "b".repeat(128) },
    exe: { url: GITHUB_URL, size: 4, sha256: "c".repeat(64), blake2b512: "d".repeat(128), signature: "signature" },
  },
};
/** The record of a release that ships on Windows alone, as the publishing tool writes it: the installer and no disk image. */
const WINDOWS_ONLY_RECORD = { version: "1.2.0", artifacts: { exe: GITHUB_RECORD.artifacts.exe } };
/** The deb the publishing tool records for a release that ships on Linux too, with made up size, digests and signature. */
const GITHUB_DEB = { url: GITHUB_URL.replace(/[^/]+$/, "Koegaki-1.2.0-amd64.deb"), size: 5, sha256: "e".repeat(64), blake2b512: "f".repeat(128), signature: "deb signature" };
/** A release for all three platforms, and one for Windows and Linux, as the publishing tool records them. */
const ALL_THREE_RECORD = { version: "1.2.0", artifacts: { ...GITHUB_RECORD.artifacts, deb: GITHUB_DEB } };
const WINDOWS_AND_LINUX_RECORD = { version: "1.2.0", artifacts: { exe: GITHUB_RECORD.artifacts.exe, deb: GITHUB_DEB } };
const CHECKED = "the GitHub release record releases/1.2.0.json checked, and public/downloads is absent";
// The installers this fixture says are in the Windows archive: two releases
// that shipped from koegaki.com/downloads before releases moved to GitHub.
const FIXTURE_ARCHIVED = ["Koegaki-1.0.0-setup.exe", "Koegaki-1.1.0-setup.exe"];
const NOTHING_SERVED = /public\/downloads exists, but nothing is served from there any more/;

/** A fresh temporary folder, removed when the test ends. */
function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "koegaki-release-downloads-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * A copy of the repository's shape in `root`: public/ with the manifest
 * offering 1.2.0 from GitHub and the other files a site serves, and releases/
 * beside it holding `record` as releases/1.2.0.json. Returns its public folder.
 */
function withFixture(root, record = GITHUB_RECORD) {
  const publicDir = join(root, "public");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "windows-updates.json"), JSON.stringify(GITHUB_MANIFEST));
  writeFileSync(join(publicDir, "appcast.xml"), "<rss/>");
  writeFileSync(join(publicDir, "og.png"), "image");
  mkdirSync(join(root, "releases"));
  writeFileSync(join(root, "releases", "1.2.0.json"), JSON.stringify(record));
  return publicDir;
}

/** Every file and folder under dir, as sorted relative paths. */
const listing = (dir) => readdirSync(dir, { recursive: true }).sort();

test("a build passes when public/downloads is absent and the offered GitHub release has a whole record", (t) => {
  // A release that ships on Windows alone has a record that states the
  // installer and no disk image, and builds as one that shipped on both; so
  // does one that ships a Linux deb beside the installer.
  for (const [shipped, record] of [
    ["both platforms", GITHUB_RECORD],
    ["Windows only", WINDOWS_ONLY_RECORD],
    ["all three platforms", ALL_THREE_RECORD],
    ["Windows and Linux", WINDOWS_AND_LINUX_RECORD],
  ]) {
    const root = tempDir(t);
    withFixture(root, record);
    const before = listing(root);
    assert.equal(checkReleaseDownloads(join(root, "public"), FIXTURE_ARCHIVED), CHECKED, shipped);
    assert.deepEqual(listing(root), before, `${shipped}: the check changed the folder`);
  }
});

test("a build fails, changing nothing, when anything at all is under public/downloads", (t) => {
  const downloads = (dir) => join(dir, "downloads");
  const put = (name, content) => (dir) => {
    mkdirSync(dirname(join(downloads(dir), name)), { recursive: true });
    writeFileSync(join(downloads(dir), name), content);
  };
  const placed = [
    ["an archived installer back in its old place", put("Koegaki-1.0.0-setup.exe", installer(10))],
    ["the installer the manifest offers", put("Koegaki-1.2.0-setup.exe", installer(10))],
    ["a disk image", put("Koegaki-1.2.0.dmg", "disk image")],
    ["a stray file", put(".DS_Store", "finder")],
    ["a file one folder down", put("old/Koegaki-0.9.0-setup.exe", installer(10))],
    ["an empty folder", (dir) => mkdirSync(downloads(dir))],
    ["a file named downloads", (dir) => writeFileSync(downloads(dir), "a file")],
    ["a symbolic link to a folder", (dir) => symlinkSync(join(dir, "..", "releases"), downloads(dir))],
    ["a symbolic link that leads nowhere", (dir) => symlinkSync("missing", downloads(dir))],
  ];
  for (const [what, place] of placed) {
    const root = tempDir(t);
    const publicDir = withFixture(root);
    place(publicDir);
    const before = listing(root);
    assert.throws(() => checkReleaseDownloads(publicDir, FIXTURE_ARCHIVED), NOTHING_SERVED, what);
    assert.deepEqual(listing(root), before, `${what}: the check changed the folder`);
  }
});

test("a build fails, changing nothing, when the GitHub release the manifest offers is not the exact asset of a release of its own or has no matching record", (t) => {
  const record = (dir) => join(dir, "..", "releases", "1.2.0.json");
  const recordWith = (change) => {
    const copy = structuredClone(GITHUB_RECORD);
    change(copy);
    return copy;
  };
  const writeRecord = (change) => (dir) => writeFileSync(record(dir), JSON.stringify(recordWith(change)));
  const incomplete = /releases\/1\.2\.0\.json is not the record the publishing tool writes/;
  const manifestWithUrl = (url) => (dir) =>
    writeFileSync(join(dir, "windows-updates.json"), JSON.stringify({ ...GITHUB_MANIFEST, platforms: { "windows-x86_64": { url, signature: "signature" } } }));
  const notTheAsset = /offers https?:\/\/github\.com\/\S+, which is not the GitHub release asset https:\/\/github\.com\/vishutdhar\/koegaki-releases\/releases\/download\/v1\.2\.0\/Koegaki-1\.2\.0-setup\.exe/;
  // A manifest and a record offering 1.1.0, which the fixture's archive holds.
  const offerArchived = (url) => (dir) => {
    writeFileSync(join(dir, "windows-updates.json"), JSON.stringify({ version: "1.1.0", platforms: { "windows-x86_64": { url, signature: "signature" } } }));
    writeFileSync(join(dir, "..", "releases", "1.1.0.json"), JSON.stringify(JSON.parse(JSON.stringify(GITHUB_RECORD).replaceAll("1.2.0", "1.1.0"))));
  };
  const damage = [
    ["no record", (dir) => rmSync(record(dir)), /releases\/1\.2\.0\.json, the record of the GitHub release public\/windows-updates\.json offers, cannot be read/],
    ["no releases folder", (dir) => rmSync(join(dir, "..", "releases"), { recursive: true }), /releases\/1\.2\.0\.json, the record .* cannot be read/],
    ["a record that is not JSON", (dir) => writeFileSync(record(dir), "{"), /releases\/1\.2\.0\.json, the record .* cannot be read/],
    [
      "a folder in the record's place",
      (dir) => {
        rmSync(record(dir));
        mkdirSync(record(dir));
      },
      /releases\/1\.2\.0\.json, the record .* cannot be read/,
    ],
    ["a record of another version", (dir) => writeFileSync(record(dir), JSON.stringify({ ...GITHUB_RECORD, version: "1.1.0" })), /names version "1\.1\.0", not 1\.2\.0/],
    ["a record that is null", (dir) => writeFileSync(record(dir), "null"), /names version undefined, not 1\.2\.0/],
    [
      "a record of another installer",
      writeRecord((r) => (r.artifacts.exe.url = GITHUB_URL.replace("/v1.2.0/", "/v1.1.0/"))),
      /records the installer at "https:\/\/github\.com\/\S+v1\.1\.0\S+", not https:\/\/github\.com\/\S+, the url public\/windows-updates\.json offers/,
    ],
    ["a url on another tag", manifestWithUrl(GITHUB_URL.replace("/v1.2.0/", "/v1.2.1/")), notTheAsset],
    ["a url in another repo", manifestWithUrl(GITHUB_URL.replace("/koegaki-releases/", "/koegaki/")), notTheAsset],
    ["a url of another owner", manifestWithUrl(GITHUB_URL.replace("/vishutdhar/", "/someone/")), notTheAsset],
    ["a url with another asset name", manifestWithUrl(GITHUB_URL.replace(/[^/]+$/, "Koegaki_1.2.0_x64-setup.exe")), notTheAsset],
    ["a url with a query", manifestWithUrl(`${GITHUB_URL}?raw=1`), notTheAsset],
    ["a url over http", manifestWithUrl(GITHUB_URL.replace(/^https:/, "http:")), notTheAsset],
    ["the installer in the windows-archive release", manifestWithUrl(`${ARCHIVE_DOWNLOAD}/Koegaki-1.2.0-setup.exe`), notTheAsset],
    [
      // releases/1.9.0.json exists for the site tests, but 1.9.0 shipped from
      // koegaki.com/downloads and was never a GitHub release of its own.
      "an archived release as a v<version> release, with a record of it",
      offerArchived(GITHUB_URL.replaceAll("1.2.0", "1.1.0")),
      /Koegaki-1\.1\.0-setup\.exe is in the Windows archive, so 1\.1\.0 shipped before releases moved to GitHub and no v1\.1\.0 GitHub release of it exists/,
    ],
    ["an archived release offered from the windows-archive release", offerArchived(`${ARCHIVE_DOWNLOAD}/Koegaki-1.1.0-setup.exe`), /which is not the GitHub release asset/],
    ["a record with no installer sha256", writeRecord((r) => delete r.artifacts.exe.sha256), incomplete],
    ["a record whose installer size is text", writeRecord((r) => (r.artifacts.exe.size = "4")), incomplete],
    ["a record whose installer digest is short", writeRecord((r) => (r.artifacts.exe.blake2b512 = "d".repeat(127))), incomplete],
    // A record may leave out the disk image, as a Windows only release does,
    // but the installer the manifest offers is always recorded, and a disk
    // image it does state is held to the same shape as on a release that
    // shipped on both platforms.
    ["a record with no installer", writeRecord((r) => delete r.artifacts.exe), /records the installer at undefined, not https:\/\/github\.com\/\S+, the url public\/windows-updates\.json offers/],
    ["a record whose disk image is null", writeRecord((r) => (r.artifacts.dmg = null)), incomplete],
    ["a record whose disk image is text", writeRecord((r) => (r.artifacts.dmg = "Koegaki-1.2.0.dmg")), incomplete],
    ["a record whose disk image has no size", writeRecord((r) => delete r.artifacts.dmg.size), incomplete],
    // The site tests accept a record that states any of a dmg, an exe and a
    // deb, and nothing else, so a build refuses any other artifact as they do,
    // and holds a deb it does state to the shape the publishing tool writes.
    [
      "a record whose disk image key is misspelled",
      writeRecord((r) => {
        r.artifacts.dmgg = r.artifacts.dmg;
        delete r.artifacts.dmg;
      }),
      incomplete,
    ],
    ["a record with an artifact the site does not serve", writeRecord((r) => (r.artifacts.rpm = { ...GITHUB_DEB, url: GITHUB_DEB.url.replace(/[^/]+$/, "Koegaki-1.2.0.x86_64.rpm") })), incomplete],
    ["a record whose deb key is misspelled", writeRecord((r) => (r.artifacts.debs = structuredClone(GITHUB_DEB))), incomplete],
    ["a record whose deb is null", writeRecord((r) => (r.artifacts.deb = null)), incomplete],
    ["a record whose deb has no signature", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, signature: undefined })), incomplete],
    ["a record whose deb signature is empty", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, signature: "" })), incomplete],
    ["a record whose deb is named as an installer", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, url: GITHUB_URL })), incomplete],
    ["a record whose deb is on another tag", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, url: GITHUB_DEB.url.replace("/v1.2.0/", "/v1.1.0/") })), incomplete],
    ["a record whose deb size is text", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, size: "5" })), incomplete],
    ["a record whose deb digest is short", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, sha256: "e".repeat(63) })), incomplete],
    // Each artifact holds exactly the fields the publishing tool writes for its kind.
    ["a record whose deb holds another field", writeRecord((r) => (r.artifacts.deb = { ...GITHUB_DEB, notes: "x" })), incomplete],
    ["a record whose installer holds another field", writeRecord((r) => (r.artifacts.exe.notes = "x")), incomplete],
    ["a record whose disk image holds a signature", writeRecord((r) => (r.artifacts.dmg.signature = "x")), incomplete],
    ["a record whose disk image is on another tag", writeRecord((r) => (r.artifacts.dmg.url = r.artifacts.dmg.url.replace("/v1.2.0/", "/v1.1.0/"))), incomplete],
    ["a record whose disk image digest is uppercase", writeRecord((r) => (r.artifacts.dmg.sha256 = "A".repeat(64))), incomplete],
    ["a record with no installer signature", writeRecord((r) => delete r.artifacts.exe.signature), /records another installer signature than public\/windows-updates\.json carries/],
    ["a record of another installer signature", writeRecord((r) => (r.artifacts.exe.signature = "another")), /records another installer signature than public\/windows-updates\.json carries/],
    ["no update manifest", (dir) => rmSync(join(dir, "windows-updates.json")), /cannot read public\/windows-updates\.json/],
    ["a manifest that is not JSON", (dir) => writeFileSync(join(dir, "windows-updates.json"), "{"), /cannot read public\/windows-updates\.json/],
    ["a version that names no installer", (dir) => writeFileSync(join(dir, "windows-updates.json"), '{"version":"../1.2.0"}'), /names no installer/],
  ];
  for (const [what, harm, message] of damage) {
    const root = tempDir(t);
    const publicDir = withFixture(root);
    harm(publicDir);
    const before = listing(root);
    assert.throws(() => checkReleaseDownloads(publicDir, FIXTURE_ARCHIVED), message, what);
    assert.deepEqual(listing(root), before, `${what}: the check changed the folder`);
  }
});

test("a manifest offering an installer from any other host fails, whatever records exist, since the site serves no installer itself", (t) => {
  for (const url of [
    "https://koegaki.com/downloads/Koegaki-1.2.0-setup.exe",
    "https://koegaki.com/Koegaki-1.2.0-setup.exe",
    "https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/Koegaki-1.2.0-setup.exe",
    "https://www.github.com/vishutdhar/koegaki-releases/releases/download/v1.2.0/Koegaki-1.2.0-setup.exe",
    "not a url",
  ]) {
    const root = tempDir(t);
    const publicDir = withFixture(root, { version: "1.2.0", artifacts: { exe: { ...GITHUB_RECORD.artifacts.exe, url } } });
    writeFileSync(join(publicDir, "windows-updates.json"), JSON.stringify({ version: "1.2.0", platforms: { "windows-x86_64": { url, signature: "signature" } } }));
    assert.throws(() => checkReleaseDownloads(publicDir, FIXTURE_ARCHIVED), /which is not a GitHub release asset; the site serves no installer itself/, url);
  }
});

test("the check refuses every installer in the Windows archive as a GitHub release of its own, by default", (t) => {
  for (const { name } of WINDOWS_ARCHIVE) {
    const version = name.match(/^Koegaki-(\d+\.\d+\.\d+)-setup\.exe$/)[1];
    const root = tempDir(t);
    const publicDir = withFixture(root, JSON.parse(JSON.stringify(GITHUB_RECORD).replaceAll("1.2.0", version)));
    writeFileSync(join(publicDir, "windows-updates.json"), JSON.stringify(JSON.parse(JSON.stringify(GITHUB_MANIFEST).replaceAll("1.2.0", version))));
    rmSync(join(root, "releases", "1.2.0.json"));
    writeFileSync(join(root, "releases", `${version}.json`), JSON.stringify(JSON.parse(JSON.stringify(GITHUB_RECORD).replaceAll("1.2.0", version))));
    assert.throws(() => checkReleaseDownloads(publicDir), new RegExp(`${name.replaceAll(".", "\\.")} is in the Windows archive`), name);
  }
});

test("run as a script, it checks the public folder beside it from any working directory, and fails the build with the reason", (t) => {
  // A copy of the repository's shape: scripts/ beside public/ and releases/.
  const root = tempDir(t);
  for (const name of ["check-release-downloads.mjs", "windows-archive.mjs"]) {
    mkdirSync(join(root, "scripts"), { recursive: true });
    copyFileSync(new URL(`../scripts/${name}`, import.meta.url), join(root, "scripts", name));
  }
  const publicDir = withFixture(root);
  // Started from an unrelated folder, so a path taken from the working directory would miss.
  const elsewhere = tempDir(t);
  // The test runner's own context variable would make the child report as a test.
  const base = { ...process.env };
  delete base.NODE_TEST_CONTEXT;
  const run = () => spawnSync(process.execPath, [join(root, "scripts", "check-release-downloads.mjs")], { cwd: elsewhere, env: base, encoding: "utf8" });
  const ok = run();
  assert.deepEqual({ status: ok.status, stdout: ok.stdout, stderr: ok.stderr }, { status: 0, stdout: `${CHECKED}\n`, stderr: "" });
  // An archived installer put back where it was: the build fails, so no
  // deployment carries it again.
  mkdirSync(join(publicDir, "downloads"));
  writeFileSync(join(publicDir, "downloads", WINDOWS_ARCHIVE[0].name), installer(10));
  const restored = run();
  assert.equal(restored.status, 1, "a build with a file under public/downloads did not fail");
  assert.equal(restored.stdout, "");
  assert.match(restored.stderr, /^check-release-downloads: public\/downloads exists, but nothing is served from there any more/);
  rmSync(join(publicDir, "downloads"), { recursive: true });
  rmSync(join(root, "releases", "1.2.0.json"));
  const noRecord = run();
  assert.equal(noRecord.status, 1, "a build without the record did not fail");
  assert.equal(noRecord.stdout, "");
  assert.match(noRecord.stderr, /releases\/1\.2\.0\.json, the record of the GitHub release public\/windows-updates\.json offers, cannot be read/);
});

test("the repository passes the check: nothing under public/downloads, and the release the manifest offers is recorded", () => {
  const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
  const { version } = JSON.parse(readFileSync(join(publicDir, "windows-updates.json"), "utf8"));
  assert.equal(checkReleaseDownloads(publicDir), `the GitHub release record releases/${version}.json checked, and public/downloads is absent`);
});

test("Vercel runs the check before next build, and vercel.json holds no redirect, rewrite or route", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(vercel.buildCommand?.split("&&").map((step) => step.trim()), ["node scripts/check-release-downloads.mjs", "next build"]);
  // The archive redirects live in next.config.ts alone, one mechanism, where
  // the build writes them to the routes manifest the site tests read.
  for (const key of ["rewrites", "redirects", "routes", "headers", "cleanUrls", "trailingSlash"]) assert.equal(vercel[key], undefined, `vercel.json sets ${key}`);
});
