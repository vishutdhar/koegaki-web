// Checks the step that keeps the Windows installers out of preview deployments
// (scripts/strip-preview-installers.mjs). Every case runs in a throwaway
// folder, never the real public/downloads, and the last test pins how Vercel
// runs the step and that local builds never do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stripPreviewInstallers } from "../scripts/strip-preview-installers.mjs";

/**
 * A downloads folder: two installers to strip, and files a preview must keep
 * (a signature, a disk image, an installer one level down, and a folder whose
 * name ends in .exe).
 */
const FIXTURE = {
  "Koegaki-1.0.0-setup.exe": Buffer.alloc(1_200_000),
  "Koegaki-1.1.0-setup.exe": Buffer.alloc(1_000_000),
  "Koegaki-1.1.0-setup.exe.sig": "signature",
  "Koegaki-1.1.0.dmg": "disk image",
  "notes.txt": "notes",
  "old/Koegaki-0.9.0-setup.exe": "an installer one level down",
  "archive.exe/readme.txt": "a folder named like an installer",
};
const STRIPPED = ["Koegaki-1.0.0-setup.exe", "Koegaki-1.1.0-setup.exe"];

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

test("a preview build removes the installers directly in the folder and nothing else", (t) => {
  const dir = withFixture(tempDir(t));
  const before = listing(dir);
  const result = stripPreviewInstallers("preview", dir);
  assert.deepEqual([...result.removed].sort(), STRIPPED);
  assert.equal(result.bytes, 2_200_000);
  assert.equal(result.message, "preview build: removed 2 installers (2 MB)");
  assert.deepEqual(listing(dir), before.filter((p) => !STRIPPED.includes(p)));
});

test("any VERCEL_ENV other than exactly preview keeps every file", (t) => {
  for (const env of ["production", "development", undefined, "", "Preview", " preview ", "PREVIEW", "preview\n"]) {
    const dir = withFixture(tempDir(t));
    const before = listing(dir);
    const result = stripPreviewInstallers(env, dir);
    assert.deepEqual(result.removed, [], `VERCEL_ENV ${JSON.stringify(env)} removed files`);
    assert.deepEqual(listing(dir), before, `VERCEL_ENV ${JSON.stringify(env)} changed the folder`);
    assert.match(result.message, /: installers kept$/, `VERCEL_ENV ${JSON.stringify(env)}`);
  }
});

test("a missing downloads folder removes nothing and does not throw", (t) => {
  const absent = join(tempDir(t), "absent");
  for (const env of ["preview", "production"]) {
    const result = stripPreviewInstallers(env, absent);
    assert.deepEqual(result.removed, [], `VERCEL_ENV ${env}`);
  }
  assert.equal(stripPreviewInstallers("preview", absent).message, "preview build: removed 0 installers (0 MB)");
});

test("run as a script, it strips the public/downloads beside it wherever the build starts, and logs one line", (t) => {
  // A copy of the repository's shape: scripts/ beside public/downloads/.
  const root = tempDir(t);
  const script = join(root, "scripts", "strip-preview-installers.mjs");
  mkdirSync(dirname(script));
  copyFileSync(new URL("../scripts/strip-preview-installers.mjs", import.meta.url), script);
  const downloads = withFixture(join(root, "public", "downloads"));
  const before = listing(downloads);
  // Started from an unrelated folder, so a path taken from the working directory would miss.
  const elsewhere = tempDir(t);
  // The test runner's own context variable would make the child report as a test.
  const base = { ...process.env };
  delete base.VERCEL_ENV;
  delete base.NODE_TEST_CONTEXT;
  const run = (env) => execFileSync(process.execPath, [script], { cwd: elsewhere, env: { ...base, ...env }, encoding: "utf8" });
  assert.equal(run({}), "VERCEL_ENV unset: installers kept\n");
  assert.equal(run({ VERCEL_ENV: "production" }), 'VERCEL_ENV="production": installers kept\n');
  assert.deepEqual(listing(downloads), before);
  assert.equal(run({ VERCEL_ENV: "preview" }), "preview build: removed 2 installers (2 MB)\n");
  assert.deepEqual(listing(downloads), before.filter((p) => !STRIPPED.includes(p)));
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
