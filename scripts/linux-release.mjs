// Finds the Linux release the site offers: the newest record in releases/ that
// holds a deb (docs/specs/2026-10-13-linux-site.md rules 6 and 7). next.config.ts
// calls it at build time and inlines the answer as KOEGAKI_LINUX_RELEASE, which
// lib/site.ts reads, so every Linux surface of the site appears only once the
// publishing tool's record of a Linux release is committed, and nothing reads
// the file system when a page or the /buy route runs.
//
// The build fails rather than guess when a record cannot be read, or the deb it
// would offer is not the shape the publishing tool writes (Koegaki
// Tools/publish-release.sh, spec 2026-10-13-publish-tool-linux-and-windows-only
// rule 6). Every other check of the records is the site tests'.
import { readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/** The name the build inlines the Linux release under. */
export const LINUX_RELEASE_ENV = "KOEGAKI_LINUX_RELEASE";

const GITHUB_DOWNLOAD = "https://github.com/vishutdhar/koegaki-releases/releases/download";
const DEB_FIELDS = ["url", "size", "sha256", "blake2b512", "signature"];

/**
 * The folder the build reads release records from: releases/ beside
 * next.config.ts, or KOEGAKI_RELEASES_DIR for the test fixture build
 * (tests/build-linux-fixture.mjs), relative to the repository when it is not
 * absolute. Vercel sets VERCEL for every build it runs, so a deployment can
 * never build from another folder than releases/.
 */
export function releasesDir(env, root) {
  const override = env.KOEGAKI_RELEASES_DIR;
  if (!override) return join(root, "releases");
  if (env.VERCEL !== undefined) {
    throw new Error("KOEGAKI_RELEASES_DIR is for the test fixture build and is refused on Vercel; unset it so the build reads releases/");
  }
  return isAbsolute(override) ? override : join(root, override);
}

/** Version parts as numbers, so 1.10.0 sorts after 1.9.0. */
const parts = (version) => version.split(".").map(Number);
function newer(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** Throws unless `deb` is the deb the publishing tool records for `version`. */
function checkDeb(deb, version) {
  const at = `the deb of ${version}`;
  if (!deb || typeof deb !== "object" || Array.isArray(deb)) throw new Error(`${at} is not an object`);
  if (Object.keys(deb).sort().join() !== [...DEB_FIELDS].sort().join()) {
    throw new Error(`${at} holds ${JSON.stringify(Object.keys(deb))}, not ${DEB_FIELDS.join(", ")}`);
  }
  const url = `${GITHUB_DOWNLOAD}/v${version}/Koegaki-${version}-amd64.deb`;
  if (deb.url !== url) throw new Error(`${at}: url ${JSON.stringify(deb.url)} is not ${url}`);
  if (!Number.isSafeInteger(deb.size) || deb.size <= 0) throw new Error(`${at}: size ${JSON.stringify(deb.size)} is not a positive integer`);
  for (const [digest, length] of [["sha256", 64], ["blake2b512", 128]]) {
    if (typeof deb[digest] !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(deb[digest])) {
      throw new Error(`${at}: ${digest} ${JSON.stringify(deb[digest])} is not ${length} lowercase hex digits`);
    }
  }
  if (typeof deb.signature !== "string" || deb.signature === "") throw new Error(`${at}: signature is not text`);
}

/**
 * The Linux release the records in `dir` offer: the highest version whose
 * record holds a deb, as { version, url, size, sha256 }, or null when no
 * record holds one. Only files named <version>.json are records; the site
 * tests refuse any other file in releases/.
 */
export function linuxRelease(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    throw new Error(`releases/ cannot be read at ${dir} (${error.message}), so the build cannot tell whether a Linux release exists`);
  }
  let found = null;
  for (const name of names) {
    const version = name.match(/^(\d+\.\d+\.\d+)\.json$/)?.[1];
    if (!version) continue;
    let record;
    try {
      record = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch (error) {
      throw new Error(`releases/${name} cannot be read (${error.message}), so the build cannot tell whether it holds a deb`);
    }
    if (record?.version !== version) throw new Error(`releases/${name} names version ${JSON.stringify(record?.version)}, not ${version}`);
    if (!record.artifacts || typeof record.artifacts !== "object" || Array.isArray(record.artifacts)) {
      throw new Error(`releases/${name} holds no artifacts`);
    }
    if (Object.hasOwn(record.artifacts, "deb") && (!found || newer(version, found.version))) {
      found = { version, deb: record.artifacts.deb };
    }
  }
  if (!found) return null;
  checkDeb(found.deb, found.version);
  const { url, size, sha256 } = found.deb;
  return { version: found.version, url, size, sha256 };
}

/** The value the build inlines: the release as JSON, or an empty string for none. */
export function linuxReleaseEnv(release) {
  return release ? JSON.stringify(release) : "";
}
