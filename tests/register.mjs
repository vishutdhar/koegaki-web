// Lets the tests import the site's own TypeScript data modules (lib/*.ts)
// directly, so every assertion is derived from the same lists the pages
// render. Node strips the type annotations itself; this hook only supplies
// the two things its resolver does not do: the "@/" path alias from
// tsconfig.json, and extensionless relative imports of .ts files.
import { register } from "node:module";

// Type stripping arrived unflagged in Node 22.18 and 23.6; on an older Node
// every import below would fail with a syntax error that hides the cause.
if (!process.features.typescript) {
  throw new Error(`npm test needs Node 22.18 or later (type stripping); this is Node ${process.versions.node}.`);
}

register("./resolve-ts.mjs", import.meta.url);
