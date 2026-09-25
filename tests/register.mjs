// Lets the tests import the site's own TypeScript data modules (lib/*.ts)
// directly, so every assertion is derived from the same lists the pages
// render. Node strips the type annotations itself; this hook only supplies
// the two things its resolver does not do: the "@/" path alias from
// tsconfig.json, and extensionless relative imports of .ts files.
import { register } from "node:module";

register("./resolve-ts.mjs", import.meta.url);
