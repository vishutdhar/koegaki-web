// Builds the fixture site the Linux checks read (docs/specs/2026-10-13-linux-site.md
// rule 15): `next build` from the fixture's release records instead of
// releases/, so the build finds a Linux release (tests/fixtures/linux-release,
// a 1.14.0 deb of bytes made for the tests) and shows every Linux surface. The
// output moves to .next-linux-fixture so the real build that `npm test` runs
// next does not replace it, and tests/linux-fixture.test.mjs reads it there.
// Nothing deploys it: Vercel runs only vercel.json's build command, and the
// build refuses the fixture folder on Vercel (scripts/linux-release.mjs).
import { spawnSync } from "node:child_process";
import { renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../.next-linux-fixture", import.meta.url));
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

rmSync(output, { recursive: true, force: true });
const { status, error } = spawnSync(process.execPath, [next, "build"], {
  cwd: root,
  env: { ...process.env, KOEGAKI_RELEASES_DIR: "tests/fixtures/linux-release" },
  stdio: "inherit",
});
if (error || status !== 0) {
  console.error(`build-linux-fixture: next build of the fixture site failed (${error?.message ?? `exit ${status}`})`);
  process.exit(1);
}
renameSync(fileURLToPath(new URL("../.next", import.meta.url)), output);
console.log("build-linux-fixture: the fixture site is in .next-linux-fixture");
