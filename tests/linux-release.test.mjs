// Checks how the build finds the Linux release (scripts/linux-release.mjs, read
// by next.config.ts): the newest record in releases/ that holds a deb, or none.
// Every Linux surface of the site appears only when it finds one (spec
// docs/specs/2026-10-13-linux-site.md rules 6 and 7), so it is held here to
// pick exactly that record, and to fail the build rather than guess when a
// record cannot be read or the deb it would offer is not the shape the
// publishing tool writes. Every case runs in a throwaway folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LINUX_RELEASE_ENV, linuxRelease, linuxReleaseEnv, releasesDir } from "../scripts/linux-release.mjs";
import { archiveRedirects } from "../scripts/windows-archive.mjs";
import { gateOffRecords, writeGateOffReleases } from "./gate-off-releases.mjs";

const GITHUB_DOWNLOAD = "https://github.com/vishutdhar/koegaki-releases/releases/download";
const REPO = fileURLToPath(new URL("../", import.meta.url));

/** An artifact of `kind` for `version`, with made up sizes and digests of the right shape. */
function artifact(version, kind) {
  const name = { dmg: `Koegaki-${version}.dmg`, exe: `Koegaki-${version}-setup.exe`, deb: `Koegaki-${version}-amd64.deb` }[kind];
  const fields = { url: `${GITHUB_DOWNLOAD}/v${version}/${name}`, size: 10, sha256: "a".repeat(64), blake2b512: "b".repeat(128) };
  return kind === "dmg" ? fields : { ...fields, signature: `the ${kind} signature of ${version}` };
}

/** A record of `version` holding `kinds`, as the publishing tool writes it. */
const record = (version, kinds) => ({ version, artifacts: Object.fromEntries(kinds.map((kind) => [kind, artifact(version, kind)])) });

/** A fresh folder holding `files` ({ name: content }, an object written as JSON), removed when the test ends. */
function folder(t, files) {
  const dir = mkdtempSync(join(tmpdir(), "koegaki-linux-release-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return dir;
}

const offered = (version) => ({
  version,
  url: `${GITHUB_DOWNLOAD}/v${version}/Koegaki-${version}-amd64.deb`,
  size: 10,
  sha256: "a".repeat(64),
});

test("the Linux release is the newest record that holds a deb, and none while no record holds one", (t) => {
  const cases = [
    ["an empty folder", {}, null],
    ["records of the Mac and Windows only", { "1.13.0.json": record("1.13.0", ["dmg", "exe"]), "1.13.1.json": record("1.13.1", ["exe"]) }, null],
    ["a Linux only record", { "1.14.0.json": record("1.14.0", ["deb"]) }, offered("1.14.0")],
    ["a record of all three", { "1.15.0.json": record("1.15.0", ["dmg", "exe", "deb"]) }, offered("1.15.0")],
    ["a record of Windows and Linux", { "1.15.0.json": record("1.15.0", ["exe", "deb"]) }, offered("1.15.0")],
    ["a record of the Mac and Linux", { "1.15.0.json": record("1.15.0", ["dmg", "deb"]) }, offered("1.15.0")],
    [
      "a newer release without a deb beside an older one with it",
      { "1.14.0.json": record("1.14.0", ["deb"]), "1.14.1.json": record("1.14.1", ["dmg"]), "1.13.9.json": record("1.13.9", ["exe"]) },
      offered("1.14.0"),
    ],
    [
      "two releases with a deb, compared as numbers",
      { "1.9.0.json": record("1.9.0", ["deb"]), "1.10.0.json": record("1.10.0", ["deb"]), "1.14.0.json": record("1.14.0", ["deb"]) },
      offered("1.14.0"),
    ],
    ["a patch release with a deb", { "1.14.0.json": record("1.14.0", ["deb"]), "1.14.10.json": record("1.14.10", ["deb"]), "1.14.9.json": record("1.14.9", ["deb"]) }, offered("1.14.10")],
    ["a file not named for a version, which the site tests refuse", { "notes.json": record("9.9.9", ["deb"]), "1.14.0.json.bak": "{" }, null],
  ];
  for (const [what, files, expected] of cases) assert.deepEqual(linuxRelease(folder(t, files)), expected, what);
});

test("the build fails rather than guess when a record cannot be read or the deb it would offer is malformed", (t) => {
  const deb = (change) => {
    const r = record("1.14.0", ["deb"]);
    change(r.artifacts.deb, r);
    return { "1.14.0.json": r };
  };
  const cases = [
    ["a record that is not JSON", { "1.13.0.json": "{" }, /releases\/1\.13\.0\.json cannot be read/],
    ["a record of another version", { "1.13.0.json": record("1.13.1", ["exe"]) }, /releases\/1\.13\.0\.json names version "1\.13\.1"/],
    ["a record with no artifacts", { "1.13.0.json": { version: "1.13.0" } }, /releases\/1\.13\.0\.json holds no artifacts/],
    ["a record that is null", { "1.13.0.json": "null" }, /releases\/1\.13\.0\.json names version undefined/],
    ["a deb with no signature", deb((d) => delete d.signature), /the deb of 1\.14\.0 holds \["url","size","sha256","blake2b512"\]/],
    ["a deb with an empty signature", deb((d) => (d.signature = "")), /the deb of 1\.14\.0: signature is not text/],
    ["a deb with another field", deb((d) => (d.notes = "x")), /the deb of 1\.14\.0 holds/],
    ["a deb named as an installer", deb((d) => (d.url = d.url.replace("-amd64.deb", "-setup.exe"))), /the deb of 1\.14\.0: url .* is not https:\/\/github\.com\/\S+\/v1\.14\.0\/Koegaki-1\.14\.0-amd64\.deb/],
    ["a deb on another tag", deb((d) => (d.url = d.url.replace("/v1.14.0/", "/v1.13.0/"))), /the deb of 1\.14\.0: url/],
    ["a deb on another host", deb((d) => (d.url = `https://koegaki.com/downloads/Koegaki-1.14.0-amd64.deb`)), /the deb of 1\.14\.0: url/],
    ["a deb with a size as text", deb((d) => (d.size = "10")), /the deb of 1\.14\.0: size "10" is not a positive integer/],
    ["a deb with a zero size", deb((d) => (d.size = 0)), /the deb of 1\.14\.0: size 0 is not a positive integer/],
    ["a deb with an uppercase digest", deb((d) => (d.sha256 = "A".repeat(64))), /the deb of 1\.14\.0: sha256 .* is not 64 lowercase hex digits/],
    ["a deb with a short digest", deb((d) => (d.blake2b512 = "b".repeat(127))), /the deb of 1\.14\.0: blake2b512 .* is not 128 lowercase hex digits/],
    ["a deb that is null", deb((d, r) => (r.artifacts.deb = null)), /the deb of 1\.14\.0 is not an object/],
    ["a folder that is missing", null, /releases\/ cannot be read/],
  ];
  for (const [what, files, message] of cases) {
    const dir = files === null ? join(folder(t, {}), "missing") : folder(t, files);
    assert.throws(() => linuxRelease(dir), message, what);
  }
  // A malformed deb in an older release than the one offered is the site
  // tests' to refuse; the build reads only the deb it offers.
  const older = record("1.13.0", ["deb"]);
  delete older.artifacts.deb.signature;
  assert.deepEqual(linuxRelease(folder(t, { "1.13.0.json": older, "1.14.0.json": record("1.14.0", ["deb"]) })), offered("1.14.0"));
});

test("the build reads releases/, or another folder only off Vercel, for the test fixture build", (t) => {
  assert.equal(releasesDir({}, REPO), join(REPO, "releases"));
  assert.equal(releasesDir({ KOEGAKI_RELEASES_DIR: "" }, REPO), join(REPO, "releases"), "an empty override is no override");
  const fixture = folder(t, {});
  assert.equal(releasesDir({ KOEGAKI_RELEASES_DIR: fixture }, REPO), fixture);
  assert.equal(releasesDir({ KOEGAKI_RELEASES_DIR: "tests/fixtures/linux-release" }, REPO), join(REPO, "tests/fixtures/linux-release"), "a relative override is read from the repository");
  for (const VERCEL of ["1", "0", ""]) {
    assert.throws(() => releasesDir({ KOEGAKI_RELEASES_DIR: fixture, VERCEL }, REPO), /KOEGAKI_RELEASES_DIR is for the test fixture build and is refused on Vercel/, `VERCEL=${JSON.stringify(VERCEL)}`);
  }
});

test("the build inlines the Linux release as JSON of its version, url, size and SHA-256, or an empty string", () => {
  assert.equal(LINUX_RELEASE_ENV, "KOEGAKI_LINUX_RELEASE");
  assert.equal(linuxReleaseEnv(null), "");
  assert.deepEqual(JSON.parse(linuxReleaseEnv(offered("1.14.0"))), offered("1.14.0"));
});

test("next.config.ts inlines exactly the Linux release releases/ holds, and adds the Linux page's extension only with one", async () => {
  const { default: config } = await import("../next.config.ts");
  const release = linuxRelease(join(REPO, "releases"));
  assert.equal(config.env?.[LINUX_RELEASE_ENV], linuxReleaseEnv(release));
  // The redirects of the Windows archive are there with or without a Linux release.
  assert.deepEqual(Object.keys(config).sort(), release ? ["env", "pageExtensions", "redirects", "turbopack"] : ["env", "redirects", "turbopack"]);
  assert.deepEqual(await config.redirects(), archiveRedirects());
});

test("built from releases/ with every deb taken out, the config is today's apart from the empty value", async (t) => {
  // The gate off build (tests/build-gate-off-fixture.mjs) reads these records.
  // Gated off, the config is today's apart from that one value: no route,
  // output or extension setting moves (spec rule 8).
  const dir = folder(t, {});
  writeGateOffReleases(join(REPO, "releases"), dir);
  const before = process.env.KOEGAKI_RELEASES_DIR;
  process.env.KOEGAKI_RELEASES_DIR = dir;
  try {
    // The query gives another copy of the module, evaluated with those records.
    const { default: config } = await import("../next.config.ts?gate-off");
    assert.equal(config.env[LINUX_RELEASE_ENV], "");
    assert.deepEqual(Object.keys(config).sort(), ["env", "redirects", "turbopack"]);
    assert.deepEqual(await config.redirects(), archiveRedirects());
  } finally {
    if (before === undefined) delete process.env.KOEGAKI_RELEASES_DIR;
    else process.env.KOEGAKI_RELEASES_DIR = before;
  }
});

test("the gate off records are releases/ with every deb taken out, and offer no Linux release", (t) => {
  const files = {
    "1.13.0.json": record("1.13.0", ["dmg", "exe"]),
    "1.13.2.json": record("1.13.2", ["dmg"]),
    "1.14.0.json": record("1.14.0", ["deb"]),
    "1.15.0.json": record("1.15.0", ["dmg", "exe", "deb"]),
    "1.15.1.json": record("1.15.1", ["exe", "deb"]),
    "notes.txt": "not a record",
  };
  const { "1.15.0.json": both, "1.15.1.json": windowsAndLinux } = files;
  assert.deepEqual(gateOffRecords(folder(t, files)), {
    "1.13.0.json": files["1.13.0.json"],
    "1.13.2.json": files["1.13.2.json"],
    "1.15.0.json": { version: "1.15.0", artifacts: { dmg: both.artifacts.dmg, exe: both.artifacts.exe } },
    "1.15.1.json": { version: "1.15.1", artifacts: { exe: windowsAndLinux.artifacts.exe } },
  });
  // A note beside the artifacts stays with its record.
  const noted = { ...record("1.13.1", ["exe"]), note: "Windows only." };
  assert.deepEqual(gateOffRecords(folder(t, { "1.13.1.json": noted })), { "1.13.1.json": noted });
  // The real records, written as the gate off build reads them: no Linux
  // release, no deb, and every other artifact of every record as it is.
  const releases = join(REPO, "releases");
  const dir = folder(t, {});
  writeGateOffReleases(releases, dir);
  assert.equal(linuxRelease(dir), null, "the gate off records offer a Linux release");
  const read = (folderPath, name) => JSON.parse(readFileSync(join(folderPath, name), "utf8"));
  const written = new Set(readdirSync(dir));
  for (const name of written) assert.ok(!Object.hasOwn(read(dir, name).artifacts, "deb"), `${name} keeps its deb`);
  for (const name of readdirSync(releases).filter((n) => /^\d+\.\d+\.\d+\.json$/.test(n))) {
    const { version, artifacts } = read(releases, name);
    for (const [kind, artifact] of Object.entries(artifacts).filter(([kind]) => kind !== "deb")) {
      assert.ok(written.has(name), `${name} is missing, with its ${kind}`);
      assert.equal(read(dir, name).version, version, name);
      assert.deepEqual(read(dir, name).artifacts[kind], artifact, `${name} ${kind}`);
    }
    written.delete(name);
  }
  assert.deepEqual([...written], [], "the gate off records hold a release releases/ does not");
});

test("with a Linux release the config makes app/linux/page.linux.tsx a page, beside every default extension", async () => {
  // The query gives a second copy of the module, evaluated with the fixture's records.
  const before = process.env.KOEGAKI_RELEASES_DIR;
  process.env.KOEGAKI_RELEASES_DIR = "tests/fixtures/linux-release";
  try {
    const { default: config } = await import("../next.config.ts?with-linux");
    assert.deepEqual(config.pageExtensions, ["tsx", "ts", "jsx", "js", "linux.tsx"]);
    assert.deepEqual(JSON.parse(config.env[LINUX_RELEASE_ENV]), linuxRelease(join(REPO, "tests/fixtures/linux-release")));
  } finally {
    if (before === undefined) delete process.env.KOEGAKI_RELEASES_DIR;
    else process.env.KOEGAKI_RELEASES_DIR = before;
  }
});

test("the test fixture's record is a whole Linux only release the build offers", () => {
  const dir = join(REPO, "tests/fixtures/linux-release");
  assert.deepEqual(linuxRelease(dir), {
    version: "1.14.0",
    url: `${GITHUB_DOWNLOAD}/v1.14.0/Koegaki-1.14.0-amd64.deb`,
    size: 64,
    sha256: "7ace6ce361b170e88b752dccc0a0cacad962e80d7a6e710a433fad4234ca9d64",
  });
});
