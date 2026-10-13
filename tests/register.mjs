// Lets the tests import the site's own TypeScript data modules (lib/*.ts)
// directly, so every assertion is derived from the same lists the pages
// render. Node strips the type annotations itself; this hook only supplies
// the two things its resolver does not do: the "@/" path alias from
// tsconfig.json, and extensionless relative imports of .ts files.
import { register } from "node:module";
import { fileURLToPath } from "node:url";
import { LINUX_RELEASE_ENV, linuxRelease, linuxReleaseEnv, releasesDir } from "../scripts/linux-release.mjs";

// Type stripping arrived unflagged in Node 22.18 and 23.6; on an older Node
// every import below would fail with a syntax error that hides the cause.
if (!process.features.typescript) {
  throw new Error(`npm test needs Node 22.18 or later (type stripping); this is Node ${process.versions.node}.`);
}

register("./resolve-ts.mjs", import.meta.url);

// lib/site.ts reads the Linux release the build inlines (next.config.ts reads
// it from the release records). Give the tests the value the build computed
// from the same records, so the SITE they import is the SITE that was built.
// tests/linux-fixture.test.mjs replaces it with the fixture build's.
process.env[LINUX_RELEASE_ENV] = linuxReleaseEnv(linuxRelease(releasesDir(process.env, fileURLToPath(new URL("../", import.meta.url)))));
