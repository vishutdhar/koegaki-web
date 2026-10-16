// The release records of the site with every Linux release taken out: each
// record in releases/ without its deb, and a record that held nothing but a deb
// left out. The gate off build (tests/build-gate-off-fixture.mjs) reads these,
// so it is the site as it would be if no record held a deb, which spec
// docs/specs/2026-10-13-linux-site.md rule 8 holds to the site before Linux, to
// the byte. They are derived from releases/ on every build, so a new release
// joins them without a change here.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Each record of `dir` named <version>.json, by file name, without its deb; a record left with no artifact is left out. */
export function gateOffRecords(dir) {
  const records = {};
  for (const name of readdirSync(dir).sort()) {
    if (!/^\d+\.\d+\.\d+\.json$/.test(name)) continue;
    const record = JSON.parse(readFileSync(join(dir, name), "utf8"));
    const artifacts = Object.fromEntries(Object.entries(record.artifacts ?? {}).filter(([kind]) => kind !== "deb"));
    if (Object.keys(artifacts).length > 0) records[name] = { ...record, artifacts };
  }
  return records;
}

/** Writes gateOffRecords(from) into the folder `to`, made afresh. */
export function writeGateOffReleases(from, to) {
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  for (const [name, record] of Object.entries(gateOffRecords(from))) {
    writeFileSync(join(to, name), `${JSON.stringify(record, null, 2)}\n`);
  }
}
