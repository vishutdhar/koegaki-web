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
//
// From 1.9.1 the installer the manifest offers is a GitHub release asset in
// vishutdhar/koegaki-releases, and public/downloads holds only the installers
// published before it. For a manifest url on github.com the build checks
// instead that the url is exactly that release's installer asset, of a
// release that did not ship from public/downloads; that every installer
// published from public/downloads is still there, so a copy a preview
// stripped still cannot become production; and that releases/<version>.json,
// which the publishing tool writes after uploading the release and
// downloading it back, is a whole record of that release and carries the
// manifest's signature. The tests verify that signature against the recorded
// digest. A url on any other host still needs the installer in
// public/downloads.
import { closeSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_DOWNLOAD = "https://github.com/vishutdhar/koegaki-releases/releases/download";

/**
 * The installers public/downloads serves, frozen. Every release through 1.9.0
 * shipped from here, winget manifests and a third party collection point at
 * them, and from 1.9.1 nothing new lands here; the tests pin this list to the
 * folder.
 */
export const FROZEN_INSTALLERS = Object.freeze([
  "Koegaki-1.2.1-setup.exe",
  "Koegaki-1.3.0-setup.exe",
  "Koegaki-1.4.0-setup.exe",
  "Koegaki-1.5.0-setup.exe",
  "Koegaki-1.5.1-setup.exe",
  "Koegaki-1.5.2-setup.exe",
  "Koegaki-1.6.0-setup.exe",
  "Koegaki-1.7.0-setup.exe",
  "Koegaki-1.7.1-setup.exe",
  "Koegaki-1.8.0-setup.exe",
  "Koegaki-1.8.1-setup.exe",
  "Koegaki-1.9.0-setup.exe",
]);

/**
 * Throws unless `file` is a file that starts with the Windows executable
 * header; `what` names it in the message.
 */
function checkInstallerFile(file, what) {
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
}

/**
 * What public/windows-updates.json offers and how it was checked, for the
 * build log: the installer's file name, after checking it is a Windows
 * executable in public/downloads, or for a GitHub release asset, after
 * checking its record and the installers in `frozen`. Throws otherwise.
 */
function checkOfferedInstaller(publicDir, frozen) {
  let version;
  let target;
  try {
    const manifest = JSON.parse(readFileSync(join(publicDir, "windows-updates.json"), "utf8"));
    ({ version } = manifest);
    target = manifest.platforms?.["windows-x86_64"];
  } catch (error) {
    throw new Error(`cannot read public/windows-updates.json (${error.message}), so the installer it offers cannot be checked`);
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`public/windows-updates.json offers version ${JSON.stringify(version)}, which names no installer`);
  }
  const name = `Koegaki-${version}-setup.exe`;
  const url = target?.url;
  if (typeof url === "string" && URL.canParse(url) && new URL(url).hostname === "github.com") {
    return checkRecordedRelease(publicDir, version, name, target, frozen);
  }
  checkInstallerFile(join(publicDir, "downloads", name), `public/downloads/${name}, the installer public/windows-updates.json offers,`);
  return name;
}

/** What makes `record` other than the whole record the publishing tool writes for this version, as text, or "". */
function incompleteRecord(record, version) {
  const problems = [];
  for (const [kind, name] of [["dmg", `Koegaki-${version}.dmg`], ["exe", `Koegaki-${version}-setup.exe`]]) {
    const artifact = record.artifacts?.[kind];
    if (!artifact || typeof artifact !== "object") {
      problems.push(`no ${kind}`);
      continue;
    }
    if (artifact.url !== `${GITHUB_DOWNLOAD}/v${version}/${name}`) problems.push(`${kind} url ${JSON.stringify(artifact.url)}`);
    if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) problems.push(`${kind} size ${JSON.stringify(artifact.size)}`);
    if (typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(artifact.sha256)) problems.push(`${kind} sha256 ${JSON.stringify(artifact.sha256)}`);
    if (typeof artifact.blake2b512 !== "string" || !/^[0-9a-f]{128}$/.test(artifact.blake2b512)) {
      problems.push(`${kind} blake2b512 ${JSON.stringify(artifact.blake2b512)}`);
    }
  }
  return problems.join(", ");
}

/**
 * For an installer offered from GitHub: the url is exactly that release's
 * installer asset; the release is not one that shipped from public/downloads
 * (those predate GitHub hosting, so no GitHub release of them exists, although
 * the site tests keep a record of 1.9.0); every installer in `frozen` is still
 * in public/downloads and no other installer sits there; and
 * releases/<version>.json beside publicDir is a whole record of that version
 * whose installer url and signature are the manifest's. Throws otherwise.
 */
function checkRecordedRelease(publicDir, version, name, target, frozen) {
  const { url } = target;
  const asset = `${GITHUB_DOWNLOAD}/v${version}/${name}`;
  if (url !== asset) throw new Error(`public/windows-updates.json offers ${url}, which is not the GitHub release asset ${asset}`);
  if (frozen.includes(name)) {
    throw new Error(`${name} was published from public/downloads, so ${version} shipped before releases moved to GitHub and no GitHub release of it exists`);
  }
  const downloads = join(publicDir, "downloads");
  for (const published of frozen) {
    checkInstallerFile(join(downloads, published), `public/downloads/${published}, published before releases moved to GitHub,`);
  }
  // Every installer directly in public/downloads, and anything at all under
  // the offered installer's name.
  const present = readdirSync(downloads, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".exe")).map((e) => e.name);
  if (statSync(join(downloads, name), { throwIfNoEntry: false })) present.push(name);
  const added = present.find((entry) => !frozen.includes(entry));
  if (added) {
    throw new Error(`public/downloads/${added} is there, but nothing new lands in public/downloads once releases are on GitHub; remove it`);
  }
  const at = `releases/${version}.json`;
  let record;
  try {
    record = JSON.parse(readFileSync(join(publicDir, "..", "releases", `${version}.json`), "utf8"));
  } catch (error) {
    throw new Error(
      `${at}, the record of the GitHub release public/windows-updates.json offers, cannot be read (${error.message}); publish the release with Tools/publish-release.sh in the Koegaki repo, commit the record it writes, and build again`,
    );
  }
  if (record?.version !== version) throw new Error(`${at} names version ${JSON.stringify(record?.version)}, not ${version}`);
  const recorded = record.artifacts?.exe?.url;
  if (recorded !== url) throw new Error(`${at} records the installer at ${JSON.stringify(recorded)}, not ${url}, the url public/windows-updates.json offers`);
  const incomplete = incompleteRecord(record, version);
  if (incomplete) throw new Error(`${at} is not the record the publishing tool writes (${incomplete}); publish the release with Tools/publish-release.sh in the Koegaki repo and commit the record it writes`);
  if (typeof target.signature !== "string" || record.artifacts.exe.signature !== target.signature) {
    throw new Error(`${at} records another installer signature than public/windows-updates.json carries, so the manifest does not offer the installer that was published`);
  }
  return `the GitHub release record ${at}`;
}

/**
 * Check the offered installer (for a release on GitHub, its record and the
 * installers in `frozen`, by default the ones published from public/downloads),
 * then remove every .exe directly in publicDir/downloads when `env` is a
 * preview build on Vercel, and nothing otherwise. Returns the names removed, their total size in bytes, and the
 * line for the build log, which names the condition that decided.
 */
export function stripPreviewInstallers(env, publicDir, frozen = FROZEN_INSTALLERS) {
  const offered = checkOfferedInstaller(publicDir, frozen);
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
