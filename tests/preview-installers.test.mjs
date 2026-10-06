// Checks the step that keeps the Windows installers out of preview deployments
// (scripts/strip-preview-installers.mjs), and its check that every other build
// still has them. Every case runs in a throwaway folder, never the real
// public/, and the last test pins how Vercel runs the step and that local
// builds never do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripPreviewInstallers } from "../scripts/strip-preview-installers.mjs";

/** Installer bytes of the given size; a Windows executable starts with "MZ". */
const installer = (size) => Buffer.concat([Buffer.from("MZ"), Buffer.alloc(size - 2)]);

/**
 * A public folder whose update manifest offers 1.1.0: two installers to strip,
 * and files a preview must keep (a signature, a disk image, an installer one
 * level down, and a folder whose name ends in .exe).
 */
const FIXTURE = {
  "windows-updates.json": JSON.stringify({ version: "1.1.0" }),
  "downloads/Koegaki-1.0.0-setup.exe": installer(1_200_000),
  "downloads/Koegaki-1.1.0-setup.exe": installer(1_000_000),
  "downloads/Koegaki-1.1.0-setup.exe.sig": "signature",
  "downloads/Koegaki-1.1.0.dmg": "disk image",
  "downloads/notes.txt": "notes",
  "downloads/old/Koegaki-0.9.0-setup.exe": installer(10),
  "downloads/archive.exe/readme.txt": "a folder named like an installer",
};
const CURRENT = "downloads/Koegaki-1.1.0-setup.exe";
const STRIPPED = ["downloads/Koegaki-1.0.0-setup.exe", CURRENT];

// A preview built on Vercel's build machine, one built by `vercel build` on a
// developer's machine (VERCEL_ENV set, no deployment yet), and production.
const CLOUD_PREVIEW = { VERCEL_ENV: "preview", VERCEL_DEPLOYMENT_ID: "dpl_test" };
const LOCAL_PREVIEW = { VERCEL_ENV: "preview" };
const PRODUCTION = { VERCEL_ENV: "production", VERCEL_DEPLOYMENT_ID: "dpl_test" };

const STRIPPED_LINE = 'preview build on Vercel (VERCEL_ENV="preview", VERCEL_DEPLOYMENT_ID set): removed 2 installers (2 MB)';
const LOCAL_PREVIEW_LINE =
  "VERCEL_ENV=\"preview\" but VERCEL_DEPLOYMENT_ID is not set, so this is not Vercel's build machine: installers kept, Koegaki-1.1.0-setup.exe checked";
const UNSET_WARNING =
  'WARNING: VERCEL_ENV is not set, so this build cannot tell a preview from production and keeps every installer (Koegaki-1.1.0-setup.exe checked). Previews carry them all until "Enable access to System Environment Variables" is turned on in the Vercel project\'s Settings > Environment Variables.';

/** A fresh temporary folder, removed when the test ends. */
function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "koegaki-preview-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Write the fixture into dir and return dir. */
function withFixture(dir) {
  for (const [name, content] of Object.entries(FIXTURE)) {
    mkdirSync(join(dir, dirname(name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

/** Every file and folder under dir, as sorted relative paths. */
const listing = (dir) => readdirSync(dir, { recursive: true }).sort();

test("a preview build on Vercel removes the installers directly in downloads and nothing else", (t) => {
  const dir = withFixture(tempDir(t));
  const before = listing(dir);
  const result = stripPreviewInstallers(CLOUD_PREVIEW, dir);
  assert.deepEqual(result.removed.map((name) => `downloads/${name}`).sort(), STRIPPED);
  assert.equal(result.bytes, 2_200_000);
  assert.equal(result.message, STRIPPED_LINE);
  assert.deepEqual(listing(dir), before.filter((p) => !STRIPPED.includes(p)));
});

test("a preview build anywhere but Vercel's build machine keeps every file and says why", (t) => {
  // Stripping there would delete the installers from a developer's working
  // copy, and a later production deploy from that copy would ship without them.
  for (const env of [LOCAL_PREVIEW, { ...LOCAL_PREVIEW, VERCEL_DEPLOYMENT_ID: "" }]) {
    const dir = withFixture(tempDir(t));
    const before = listing(dir);
    const result = stripPreviewInstallers(env, dir);
    assert.deepEqual(result.removed, [], JSON.stringify(env));
    assert.deepEqual(listing(dir), before, JSON.stringify(env));
    assert.equal(result.message, LOCAL_PREVIEW_LINE, JSON.stringify(env));
  }
});

test("any VERCEL_ENV other than exactly preview keeps every file, on Vercel or not", (t) => {
  for (const value of ["production", "development", "", "Preview", " preview ", "PREVIEW", "preview\n"]) {
    for (const env of [{ VERCEL_ENV: value }, { VERCEL_ENV: value, VERCEL_DEPLOYMENT_ID: "dpl_test" }]) {
      const dir = withFixture(tempDir(t));
      const before = listing(dir);
      const result = stripPreviewInstallers(env, dir);
      assert.deepEqual(result.removed, [], `${JSON.stringify(env)} removed files`);
      assert.deepEqual(listing(dir), before, `${JSON.stringify(env)} changed the folder`);
      assert.equal(result.message, `VERCEL_ENV=${JSON.stringify(value)}: installers kept, Koegaki-1.1.0-setup.exe checked`);
    }
  }
});

test("with VERCEL_ENV unset a build keeps every file and warns which setting to turn on", (t) => {
  for (const env of [{}, { VERCEL_DEPLOYMENT_ID: "dpl_test" }]) {
    const dir = withFixture(tempDir(t));
    const before = listing(dir);
    const result = stripPreviewInstallers(env, dir);
    assert.deepEqual(result.removed, [], JSON.stringify(env));
    assert.deepEqual(listing(dir), before, JSON.stringify(env));
    assert.equal(result.message, UNSET_WARNING, JSON.stringify(env));
  }
});

test("a build fails, removing nothing, when the installer the site offers is missing or not a Windows executable", (t) => {
  const damage = [
    ["the installer deleted", (dir) => rmSync(join(dir, CURRENT)), /Koegaki-1\.1\.0-setup\.exe, the installer public\/windows-updates\.json offers, is missing/],
    ["the downloads folder deleted", (dir) => rmSync(join(dir, "downloads"), { recursive: true }), /is missing/],
    [
      "a folder in its place",
      (dir) => {
        rmSync(join(dir, CURRENT));
        mkdirSync(join(dir, CURRENT));
      },
      /is missing/,
    ],
    ["a Git LFS pointer in its place", (dir) => writeFileSync(join(dir, CURRENT), "version https://git-lfs.github.com/spec/v1\n"), /not a Windows executable/],
    ["an empty file in its place", (dir) => writeFileSync(join(dir, CURRENT), ""), /not a Windows executable/],
    ["no update manifest", (dir) => rmSync(join(dir, "windows-updates.json")), /cannot read public\/windows-updates\.json/],
    ["a version that names no installer", (dir) => writeFileSync(join(dir, "windows-updates.json"), '{"version":"../1.1.0"}'), /names no installer/],
  ];
  // The check runs before anything is stripped, so every preview on Vercel
  // proves it works there before a production build relies on it.
  for (const env of [PRODUCTION, LOCAL_PREVIEW, {}, CLOUD_PREVIEW]) {
    for (const [what, harm, message] of damage) {
      const dir = withFixture(tempDir(t));
      harm(dir);
      const before = listing(dir);
      assert.throws(() => stripPreviewInstallers(env, dir), message, `${what}, ${JSON.stringify(env)}`);
      assert.deepEqual(listing(dir), before, `${what}, ${JSON.stringify(env)} changed the folder`);
    }
  }
});

test("run as a script, a production build of a copy a preview stripped fails instead of shipping without installers", (t) => {
  // A copy of the repository's shape: scripts/ beside public/.
  const root = tempDir(t);
  const script = join(root, "scripts", "strip-preview-installers.mjs");
  mkdirSync(dirname(script));
  copyFileSync(new URL("../scripts/strip-preview-installers.mjs", import.meta.url), script);
  const publicDir = withFixture(join(root, "public"));
  const before = listing(publicDir);
  // Started from an unrelated folder, so a path taken from the working directory would miss.
  const elsewhere = tempDir(t);
  // The test runner's own context variable would make the child report as a test.
  const base = { ...process.env };
  for (const name of ["VERCEL_ENV", "VERCEL_DEPLOYMENT_ID", "NODE_TEST_CONTEXT"]) delete base[name];
  const run = (env) => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
      cwd: elsewhere,
      env: { ...base, ...env },
      encoding: "utf8",
    });
    return { status, stdout, stderr };
  };
  const ok = (line) => ({ status: 0, stdout: `${line}\n` });
  const outcome = ({ status, stdout }) => ({ status, stdout });
  assert.deepEqual(outcome(run({})), ok(UNSET_WARNING));
  assert.deepEqual(outcome(run(LOCAL_PREVIEW)), ok(LOCAL_PREVIEW_LINE));
  assert.deepEqual(outcome(run(PRODUCTION)), ok('VERCEL_ENV="production": installers kept, Koegaki-1.1.0-setup.exe checked'));
  assert.deepEqual(listing(publicDir), before);
  assert.deepEqual(outcome(run(CLOUD_PREVIEW)), ok(STRIPPED_LINE));
  assert.deepEqual(listing(publicDir), before.filter((p) => !STRIPPED.includes(p)));
  // The same copy, deployed to production: the build must fail so the previous
  // production deployment stays live.
  const production = run(PRODUCTION);
  assert.equal(production.status, 1, "a production build without its installers did not fail");
  assert.equal(production.stdout, "");
  assert.match(production.stderr, /Koegaki-1\.1\.0-setup\.exe, the installer public\/windows-updates\.json offers, is missing/);
});

// From 1.9.1 the installer the manifest offers is a GitHub release asset, not a
// file in public/downloads, and releases/<version>.json beside public/ records
// what was published. A copy of the repository's shape: public/ holding the
// installers already published, and releases/ beside it.
const GITHUB_URL = "https://github.com/vishutdhar/koegaki-releases/releases/download/v1.2.0/Koegaki-1.2.0-setup.exe";
const GITHUB_MANIFEST = { version: "1.2.0", platforms: { "windows-x86_64": { url: GITHUB_URL, signature: "signature" } } };
const GITHUB_RECORD = { version: "1.2.0", artifacts: { exe: { url: GITHUB_URL } } };
const GITHUB_CHECKED = "the GitHub release record releases/1.2.0.json checked";

/** A repository shaped copy whose manifest offers 1.2.0 from GitHub, with its record; returns its public folder. */
function withGithubFixture(root) {
  const publicDir = withFixture(join(root, "public"));
  writeFileSync(join(publicDir, "windows-updates.json"), JSON.stringify(GITHUB_MANIFEST));
  mkdirSync(join(root, "releases"));
  writeFileSync(join(root, "releases", "1.2.0.json"), JSON.stringify(GITHUB_RECORD));
  return publicDir;
}

test("a manifest offering a GitHub release asset needs that release's record, not an installer in public/downloads", (t) => {
  for (const [env, message] of [
    [PRODUCTION, `VERCEL_ENV="production": installers kept, ${GITHUB_CHECKED}`],
    [LOCAL_PREVIEW, `VERCEL_ENV="preview" but VERCEL_DEPLOYMENT_ID is not set, so this is not Vercel's build machine: installers kept, ${GITHUB_CHECKED}`],
    [CLOUD_PREVIEW, STRIPPED_LINE],
  ]) {
    const root = tempDir(t);
    const publicDir = withGithubFixture(root);
    const before = listing(publicDir);
    const result = stripPreviewInstallers(env, publicDir);
    assert.equal(result.message, message, JSON.stringify(env));
    const removed = env === CLOUD_PREVIEW ? STRIPPED : [];
    assert.deepEqual(listing(publicDir), before.filter((p) => !removed.includes(p)), JSON.stringify(env));
    assert.deepEqual(readdirSync(join(root, "releases")), ["1.2.0.json"], "the record was touched");
  }
});

test("a build fails, removing nothing, when the GitHub release the manifest offers is not the exact asset or has no matching record", (t) => {
  const record = (dir) => join(dir, "..", "releases", "1.2.0.json");
  const manifestWithUrl = (url) => (dir) =>
    writeFileSync(join(dir, "windows-updates.json"), JSON.stringify({ ...GITHUB_MANIFEST, platforms: { "windows-x86_64": { url, signature: "signature" } } }));
  const notTheAsset = /offers https:\/\/github\.com\/\S+, which is not the GitHub release asset https:\/\/github\.com\/vishutdhar\/koegaki-releases\/releases\/download\/v1\.2\.0\/Koegaki-1\.2\.0-setup\.exe/;
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
      (dir) => writeFileSync(record(dir), JSON.stringify({ version: "1.2.0", artifacts: { exe: { url: GITHUB_URL.replace("/v1.2.0/", "/v1.1.0/") } } })),
      /records the installer at "https:\/\/github\.com\/\S+v1\.1\.0\S+", not https:\/\/github\.com\/\S+, the url public\/windows-updates\.json offers/,
    ],
    ["a url on another tag", manifestWithUrl(GITHUB_URL.replace("/v1.2.0/", "/v1.2.1/")), notTheAsset],
    ["a url in another repo", manifestWithUrl(GITHUB_URL.replace("/koegaki-releases/", "/koegaki/")), notTheAsset],
    ["a url of another owner", manifestWithUrl(GITHUB_URL.replace("/vishutdhar/", "/someone/")), notTheAsset],
    ["a url with another asset name", manifestWithUrl(GITHUB_URL.replace(/[^/]+$/, "Koegaki_1.2.0_x64-setup.exe")), notTheAsset],
    ["a url with a query", manifestWithUrl(`${GITHUB_URL}?raw=1`), notTheAsset],
  ];
  for (const env of [PRODUCTION, LOCAL_PREVIEW, {}, CLOUD_PREVIEW]) {
    for (const [what, harm, message] of damage) {
      const root = tempDir(t);
      const publicDir = withGithubFixture(root);
      harm(publicDir);
      const before = listing(root);
      assert.throws(() => stripPreviewInstallers(env, publicDir), message, `${what}, ${JSON.stringify(env)}`);
      assert.deepEqual(listing(root), before, `${what}, ${JSON.stringify(env)} changed the folder`);
    }
  }
});

test("a manifest offering an installer from any other host still needs it in public/downloads, whatever records exist", (t) => {
  // A record proves what was published on GitHub; it says nothing of a file
  // this deployment would have to serve itself.
  for (const url of [
    "https://koegaki.com/downloads/Koegaki-1.1.0-setup.exe",
    "https://npdal36mxz3kcwxv.public.blob.vercel-storage.com/Koegaki-1.1.0-setup.exe",
    "https://www.github.com/vishutdhar/koegaki-releases/releases/download/v1.1.0/Koegaki-1.1.0-setup.exe",
    "not a url",
  ]) {
    for (const env of [PRODUCTION, CLOUD_PREVIEW]) {
      const root = tempDir(t);
      const publicDir = withFixture(join(root, "public"));
      writeFileSync(join(publicDir, "windows-updates.json"), JSON.stringify({ version: "1.1.0", platforms: { "windows-x86_64": { url, signature: "signature" } } }));
      mkdirSync(join(root, "releases"));
      writeFileSync(join(root, "releases", "1.1.0.json"), JSON.stringify({ version: "1.1.0", artifacts: { exe: { url } } }));
      const checked = stripPreviewInstallers(PRODUCTION, publicDir);
      assert.equal(checked.message, 'VERCEL_ENV="production": installers kept, Koegaki-1.1.0-setup.exe checked', url);
      rmSync(join(publicDir, CURRENT));
      const before = listing(root);
      assert.throws(() => stripPreviewInstallers(env, publicDir), /Koegaki-1\.1\.0-setup\.exe, the installer public\/windows-updates\.json offers, is missing/, `${url}, ${JSON.stringify(env)}`);
      assert.deepEqual(listing(root), before, `${url}, ${JSON.stringify(env)} changed the folder`);
    }
  }
});

test("run as a script, a production build finds releases/ beside public/ and fails when the offered GitHub release has no record", (t) => {
  const root = tempDir(t);
  const script = join(root, "scripts", "strip-preview-installers.mjs");
  mkdirSync(dirname(script));
  copyFileSync(new URL("../scripts/strip-preview-installers.mjs", import.meta.url), script);
  withGithubFixture(root);
  const elsewhere = tempDir(t);
  const base = { ...process.env };
  for (const name of ["VERCEL_ENV", "VERCEL_DEPLOYMENT_ID", "NODE_TEST_CONTEXT"]) delete base[name];
  const run = () => spawnSync(process.execPath, [script], { cwd: elsewhere, env: { ...base, ...PRODUCTION }, encoding: "utf8" });
  const ok = run();
  assert.deepEqual({ status: ok.status, stdout: ok.stdout }, { status: 0, stdout: `VERCEL_ENV="production": installers kept, ${GITHUB_CHECKED}\n` });
  rmSync(join(root, "releases", "1.2.0.json"));
  const failed = run();
  assert.equal(failed.status, 1, "a production build without the record did not fail");
  assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /releases\/1\.2\.0\.json, the record of the GitHub release public\/windows-updates\.json offers, cannot be read/);
});

test("Vercel strips the installers before next build, and npm run build and npm test never do", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.deepEqual(vercel.buildCommand?.split("&&").map((step) => step.trim()), [
    "node scripts/strip-preview-installers.mjs",
    "next build",
  ]);
  // Production serves the installers as static files, never through a rewrite or redirect (see next.config.ts).
  for (const key of ["rewrites", "redirects", "routes"]) assert.equal(vercel[key], undefined, `vercel.json sets ${key}`);
  const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  for (const name of ["build", "test"]) {
    assert.doesNotMatch(scripts[name], /strip-preview-installers/, `npm run ${name} strips the installers`);
  }
});
