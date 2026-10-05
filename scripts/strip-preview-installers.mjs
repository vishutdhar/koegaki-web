// Keeps the Windows installers out of preview deployments. public/downloads
// holds every installer ever shipped, and every Vercel deployment stores its
// own copy of the build output, so each preview carried all of them into the
// team's deployment storage although nobody downloads from a preview URL.
// vercel.json runs this before `next build`; npm run build and npm test never
// do, so local builds keep every installer.
//
// Only VERCEL_ENV exactly "preview" removes anything. Any other value, or
// none, leaves the folder untouched, so a production build can never lose an
// installer here. Only the build machine's working copy changes: git keeps
// every installer, and production serves them as static files (see
// next.config.ts).
import { readdirSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Remove every .exe directly in `dir` when `vercelEnv` is exactly "preview",
 * and nothing otherwise; a missing folder removes nothing. Returns the names
 * removed, their total size in bytes, and the line for the build log.
 */
export function stripPreviewInstallers(vercelEnv, dir) {
  if (vercelEnv !== "preview") {
    const env = vercelEnv === undefined ? "VERCEL_ENV unset" : `VERCEL_ENV=${JSON.stringify(vercelEnv)}`;
    return { removed: [], bytes: 0, message: `${env}: installers kept` };
  }
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    entries = [];
  }
  const removed = [];
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".exe")) continue;
    const file = join(dir, entry.name);
    bytes += statSync(file).size;
    unlinkSync(file);
    removed.push(entry.name);
  }
  const count = `${removed.length} installer${removed.length === 1 ? "" : "s"}`;
  return { removed, bytes, message: `preview build: removed ${count} (${Math.round(bytes / 1e6)} MB)` };
}

// Run as a script, strip the public/downloads beside this file, whatever the
// working directory. Node runs a script from its real path, so a symlinked
// path to it is resolved before comparing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const downloads = fileURLToPath(new URL("../public/downloads/", import.meta.url));
  console.log(stripPreviewInstallers(process.env.VERCEL_ENV, downloads).message);
}
