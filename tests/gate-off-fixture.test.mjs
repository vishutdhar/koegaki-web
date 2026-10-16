// Runs every check of tests/site.test.mjs on the gate off build in
// .next-gate-off (made by tests/build-gate-off-fixture.mjs, spec
// docs/specs/2026-10-13-linux-site.md rule 8 and its 2026-10-16 amendment),
// built from releases/ with every deb taken out, so no Linux release exists.
// There the pin of the site before Linux, and the check that nothing in the
// build says Linux, always run. The test runner gives each test file its own
// process, so the site this one imports is the site that build saw: the empty
// Linux release, set before site.test.mjs, and lib/site.ts with it, are loaded.
import { fileURLToPath } from "node:url";
import { LINUX_RELEASE_ENV, linuxRelease, linuxReleaseEnv } from "../scripts/linux-release.mjs";

process.env.KOEGAKI_SITE_BUILD = "gate-off";
process.env[LINUX_RELEASE_ENV] = linuxReleaseEnv(linuxRelease(fileURLToPath(new URL("../.next-gate-off-releases/", import.meta.url))));
await import("./site.test.mjs");
