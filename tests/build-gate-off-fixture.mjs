// Builds the gate off site the pin of the site before Linux reads
// (docs/specs/2026-10-13-linux-site.md rule 8 and its 2026-10-16 amendment):
// `next build` from releases/ with every deb taken out (tests/gate-off-releases.mjs,
// written to .next-gate-off-releases), so the build finds no Linux release and
// must be the site before Linux, to the byte. Once releases/ records a Linux
// release the real build shows Linux, and this build is where the gate's off
// side is still held. The output moves to .next-gate-off so the real build that
// `npm test` runs next does not replace it, and tests/gate-off-fixture.test.mjs
// reads it there. Nothing deploys it: Vercel runs only vercel.json's build
// command, and the build refuses another release folder on Vercel
// (scripts/linux-release.mjs).
import { spawnSync } from "node:child_process";
import { renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeGateOffReleases } from "./gate-off-releases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const releases = fileURLToPath(new URL("../releases", import.meta.url));
const records = fileURLToPath(new URL("../.next-gate-off-releases", import.meta.url));
const output = fileURLToPath(new URL("../.next-gate-off", import.meta.url));
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

writeGateOffReleases(releases, records);
rmSync(output, { recursive: true, force: true });
const { status, error } = spawnSync(process.execPath, [next, "build"], {
  cwd: root,
  env: { ...process.env, KOEGAKI_RELEASES_DIR: ".next-gate-off-releases" },
  stdio: "inherit",
});
if (error || status !== 0) {
  console.error(`build-gate-off-fixture: next build of the gate off site failed (${error?.message ?? `exit ${status}`})`);
  process.exit(1);
}
renameSync(fileURLToPath(new URL("../.next", import.meta.url)), output);
console.log("build-gate-off-fixture: the gate off site is in .next-gate-off");
