// Runs every check of tests/site.test.mjs on the fixture build in
// .next-linux-fixture (made by tests/build-linux-fixture.mjs, spec
// docs/specs/2026-10-13-linux-site.md rule 15), where a Linux release exists.
// The test runner gives each test file its own process, so the site this one
// imports is the site that build saw: the Linux release of the fixture's
// records, set before site.test.mjs, and lib/site.ts with it, are loaded.
import { fileURLToPath } from "node:url";
import { LINUX_RELEASE_ENV, linuxRelease, linuxReleaseEnv } from "../scripts/linux-release.mjs";

process.env.KOEGAKI_SITE_BUILD = "linux-fixture";
process.env[LINUX_RELEASE_ENV] = linuxReleaseEnv(linuxRelease(fileURLToPath(new URL("fixtures/linux-release/", import.meta.url))));
await import("./site.test.mjs");
