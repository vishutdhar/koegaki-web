// Keeps the Windows installers out of preview deployments. public/downloads
// holds every installer ever shipped, and every Vercel deployment stores its
// own copy of the build output, so each preview carried all of them into the
// team's deployment storage although nobody downloads from a preview URL.
// vercel.json runs this before `next build`; npm run build and npm test never
// do, so local builds keep every installer.
//
// Installers are removed only from a preview built on Vercel's own build
// machine: VERCEL_ENV exactly "preview" and a VERCEL_DEPLOYMENT_ID, which
// Vercel sets for the deployment it is building and a local `vercel build`
// does not, so a developer's working copy never loses them. Any other build
// keeps every file, and first every build checks that the installer the site
// offers is really there, failing otherwise, so a copy that lost its
// installers can never become a production deployment. Git keeps every
// installer, and production serves them as static files (see next.config.ts).
import { closeSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The file name of the installer public/windows-updates.json offers, after
 * checking it is a Windows executable in public/downloads. Throws otherwise.
 */
function checkOfferedInstaller(publicDir) {
  let version;
  try {
    ({ version } = JSON.parse(readFileSync(join(publicDir, "windows-updates.json"), "utf8")));
  } catch (error) {
    throw new Error(`cannot read public/windows-updates.json (${error.message}), so the installer it offers cannot be checked`);
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`public/windows-updates.json offers version ${JSON.stringify(version)}, which names no installer`);
  }
  const name = `Koegaki-${version}-setup.exe`;
  const file = join(publicDir, "downloads", name);
  const what = `public/downloads/${name}, the installer public/windows-updates.json offers,`;
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`${what} is missing, so this deployment would serve a 404 for it; restore the installers (git checkout -- public/downloads) and build again`);
  }
  // A Git LFS pointer or any other placeholder is not empty, so check the
  // executable header rather than the size.
  const head = Buffer.alloc(2);
  const fd = openSync(file, "r");
  try {
    readSync(fd, head, 0, 2, 0);
  } finally {
    closeSync(fd);
  }
  if (head.toString("latin1") !== "MZ") {
    throw new Error(`${what} is not a Windows executable (it does not start with MZ), so a placeholder would be served in its place`);
  }
  return name;
}

/**
 * Check the offered installer, then remove every .exe directly in
 * publicDir/downloads when `env` is a preview build on Vercel, and nothing
 * otherwise. Returns the names removed, their total size in bytes, and the
 * line for the build log, which names the condition that decided.
 */
export function stripPreviewInstallers(env, publicDir) {
  const offered = checkOfferedInstaller(publicDir);
  const kept = (message) => ({ removed: [], bytes: 0, message });
  if (env.VERCEL_ENV === undefined) {
    return kept(
      `WARNING: VERCEL_ENV is not set, so this build cannot tell a preview from production and keeps every installer (${offered} checked). Previews carry them all until "Enable access to System Environment Variables" is turned on in the Vercel project's Settings > Environment Variables.`,
    );
  }
  if (env.VERCEL_ENV !== "preview") return kept(`VERCEL_ENV=${JSON.stringify(env.VERCEL_ENV)}: installers kept, ${offered} checked`);
  if (!env.VERCEL_DEPLOYMENT_ID) {
    return kept(`VERCEL_ENV="preview" but VERCEL_DEPLOYMENT_ID is not set, so this is not Vercel's build machine: installers kept, ${offered} checked`);
  }
  const dir = join(publicDir, "downloads");
  const removed = [];
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".exe")) continue;
    const file = join(dir, entry.name);
    bytes += statSync(file).size;
    unlinkSync(file);
    removed.push(entry.name);
  }
  const count = `${removed.length} installer${removed.length === 1 ? "" : "s"}`;
  return {
    removed,
    bytes,
    message: `preview build on Vercel (VERCEL_ENV="preview", VERCEL_DEPLOYMENT_ID set): removed ${count} (${Math.round(bytes / 1e6)} MB)`,
  };
}

// Run as a script, act on the public folder beside this file, whatever the
// working directory, and fail the build when the check fails. Node runs a
// script from its real path, so a symlinked path to it is resolved before
// comparing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(stripPreviewInstallers(process.env, fileURLToPath(new URL("../public/", import.meta.url))).message);
  } catch (error) {
    console.error(`strip-preview-installers: ${error.message}`);
    process.exitCode = 1;
  }
}
