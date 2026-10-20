// The check Vercel runs before every build of the site (vercel.json), so no
// deployment carries release files again, or offers an installer that was not
// published.
//
// public/downloads served the Windows installers through 1.9.0 as static
// files, and every production deployment stored all twelve of them (166 MB).
// They are now assets of the windows-archive release in
// vishutdhar/koegaki-releases, and koegaki.com/downloads/<name> redirects there
// (scripts/windows-archive.mjs, next.config.ts), so public/downloads must not
// exist at all: whatever sat there would be served, and stored in every
// deployment, again. The build fails if it does, whatever it holds.
//
// From 1.9.1 the installer public/windows-updates.json offers is a GitHub
// release asset. The build checks that the url is exactly that release's
// installer asset, of a release of its own that is not in the Windows archive,
// and that releases/<version>.json, which the publishing tool writes after
// uploading the release and downloading it back, is a whole record of that
// release and carries the manifest's signature. A release that ships on
// Windows alone records its installer and no disk image, and one that ships on
// Linux too records its deb beside them. The site tests verify that signature
// against the recorded digest. A url on any other host fails: the site serves
// no installer itself.
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WINDOWS_ARCHIVE } from "./windows-archive.mjs";

const GITHUB_DOWNLOAD = "https://github.com/vishutdhar/koegaki-releases/releases/download";

/** The installers in the Windows archive, which shipped from koegaki.com/downloads before releases moved to GitHub. */
const ARCHIVED = Object.freeze(WINDOWS_ARCHIVE.map(({ name }) => name));

/**
 * What makes `record` other than the whole record the publishing tool writes
 * for this version, as text, or "". The installer is always recorded, since
 * the manifest offers it. A release that ships on Windows alone has no disk
 * image, so its record leaves the dmg out; a dmg the record does state is held
 * to the same url, size and digests as the installer. A release that ships on
 * Linux too records its deb, held to the same and to a signature, which the
 * publishing tool always writes for it (Koegaki spec
 * 2026-10-13-publish-tool-linux-and-windows-only rule 6). Any other artifact
 * is refused, as the site tests refuse it, so a misspelled dmg never passes
 * for a Windows only record.
 */
function incompleteRecord(record, version) {
  const problems = [];
  const artifacts = record.artifacts && typeof record.artifacts === "object" ? record.artifacts : {};
  for (const kind of Object.keys(artifacts)) {
    if (kind !== "dmg" && kind !== "exe" && kind !== "deb") problems.push(`${JSON.stringify(kind)}, which is not a dmg, an exe or a deb`);
  }
  // The fields the publishing tool writes for each kind; the installer and the deb carry their updater signature.
  const fields = { dmg: "blake2b512,sha256,size,url", exe: "blake2b512,sha256,signature,size,url", deb: "blake2b512,sha256,signature,size,url" };
  for (const [kind, name] of [["dmg", `Koegaki-${version}.dmg`], ["exe", `Koegaki-${version}-setup.exe`], ["deb", `Koegaki-${version}-amd64.deb`]]) {
    if (kind !== "exe" && !Object.hasOwn(artifacts, kind)) continue;
    const artifact = artifacts[kind];
    if (!artifact || typeof artifact !== "object") {
      problems.push(`no ${kind}`);
      continue;
    }
    // A missing field is named below by its own check; an extra one is named here.
    const extra = Object.keys(artifact).filter((key) => !fields[kind].split(",").includes(key));
    if (extra.length) problems.push(`${kind} fields ${JSON.stringify(extra)}`);
    if (artifact.url !== `${GITHUB_DOWNLOAD}/v${version}/${name}`) problems.push(`${kind} url ${JSON.stringify(artifact.url)}`);
    if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) problems.push(`${kind} size ${JSON.stringify(artifact.size)}`);
    if (typeof artifact.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(artifact.sha256)) problems.push(`${kind} sha256 ${JSON.stringify(artifact.sha256)}`);
    if (typeof artifact.blake2b512 !== "string" || !/^[0-9a-f]{128}$/.test(artifact.blake2b512)) {
      problems.push(`${kind} blake2b512 ${JSON.stringify(artifact.blake2b512)}`);
    }
    // The installer's signature is held to the manifest's below.
    if (kind === "deb" && (typeof artifact.signature !== "string" || artifact.signature === "")) {
      problems.push(`deb signature ${JSON.stringify(artifact.signature)}`);
    }
  }
  return problems.join(", ");
}

/**
 * For the installer public/windows-updates.json offers from GitHub: the url is
 * exactly that release's installer asset; the release is not one in
 * `archived`, which shipped from koegaki.com/downloads before GitHub hosting,
 * so no GitHub release of its own exists for it, although the site tests keep a
 * record of 1.9.0; and releases/<version>.json beside publicDir is a whole
 * record of that version whose installer url and signature are the manifest's.
 * Returns what was checked, for the build log. Throws otherwise.
 */
function checkRecordedRelease(publicDir, version, name, target, archived) {
  const { url } = target;
  const asset = `${GITHUB_DOWNLOAD}/v${version}/${name}`;
  if (url !== asset) throw new Error(`public/windows-updates.json offers ${url}, which is not the GitHub release asset ${asset}`);
  if (archived.includes(name)) {
    throw new Error(`${name} is in the Windows archive, so ${version} shipped before releases moved to GitHub and no v${version} GitHub release of it exists`);
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
 * Check `publicDir`, the site's public folder: nothing at all is at
 * publicDir/downloads, not a file, a folder or a link; and the installer
 * public/windows-updates.json offers is a GitHub release asset of a release of
 * its own, not one in `archived` (by default the Windows archive's installers),
 * recorded whole in releases/ beside publicDir. Returns the line for the build
 * log; throws with the reason otherwise. It reads, and never changes, anything.
 */
export function checkReleaseDownloads(publicDir, archived = ARCHIVED) {
  if (lstatSync(join(publicDir, "downloads"), { throwIfNoEntry: false })) {
    throw new Error(
      "public/downloads exists, but nothing is served from there any more: koegaki.com/downloads/<name> redirects to the windows-archive release (next.config.ts), and every release from 1.9.1 is a GitHub release of its own; remove public/downloads",
    );
  }
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
  const url = target?.url;
  if (typeof url !== "string" || !URL.canParse(url) || new URL(url).hostname !== "github.com") {
    throw new Error(
      `public/windows-updates.json offers ${JSON.stringify(url)}, which is not a GitHub release asset; the site serves no installer itself, so publish the release with Tools/publish-release.sh in the Koegaki repo`,
    );
  }
  return `${checkRecordedRelease(publicDir, version, `Koegaki-${version}-setup.exe`, target, archived)} checked, and public/downloads is absent`;
}

// Run as a script, check the public folder beside this file, whatever the
// working directory, and fail the build when the check fails. Node runs a
// script from its real path, so a symlinked path to it is resolved before
// comparing.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(checkReleaseDownloads(fileURLToPath(new URL("../public/", import.meta.url))));
  } catch (error) {
    console.error(`check-release-downloads: ${error.message}`);
    process.exitCode = 1;
  }
}
