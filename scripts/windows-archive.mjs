// The Windows installers of Koegaki 1.2.1 to 1.9.0, which koegaki.com served
// as static files from public/downloads until October 2026. Every production
// deployment carried all twelve (166 MB), so they moved to one release of
// their own, windows-archive in vishutdhar/koegaki-releases, uploaded once and
// downloaded back to compare before it was published (immutable, like every
// release there). koegaki.com/downloads/<name> answers a permanent redirect to
// the asset of the same name (next.config.ts), so the winget manifests of
// 1.2.1, 1.4.0, 1.5.0 and 1.5.1, which name those urls and the SHA-256 of
// their bytes, and every old link keep resolving to the same bytes.
//
// The redirect is a 301, not the 308 Next.js gives a permanent redirect. Both
// are permanent, and a client of these urls only ever sends GET or HEAD, so
// 308's one difference, keeping a POST a POST, buys nothing here, while 308 is
// not followed by every client that still fetches them: the .NET Framework web
// stack, which Windows PowerShell 5.1 and package tools built on it use,
// follows 300, 301, 302, 303 and 307 and stops at a 308. winget
// (Delivery Optimization, then WinINet, which follows 308 only from Windows
// 10), the Windows updater of these versions (reqwest through tower-http) and
// browsers follow both. docs/downloads-archive.md holds the evidence.
//
// This table is the record of those bytes, as the files in public/downloads
// measured before they were removed from the tree (git history keeps them;
// 6d130a7 holds all twelve). Each entry is the asset's name, its size in bytes, and the
// lowercase hex SHA-256 and BLAKE2b-512 of the whole file; the BLAKE2b-512 is
// what the Windows updater signature of an installer covers. The site tests
// hold the redirects to this table, and with RELEASE_FETCH=1 they download
// every asset through its koegaki.com url and hold it to its entry.
// Nothing is ever added here: from 1.9.1 every release is its own GitHub
// release with a record in releases/.

/** The tag of the release that holds the archived installers. */
export const ARCHIVE_TAG = "windows-archive";

/** Where the archived installers are served from, the release's download url. */
export const ARCHIVE_DOWNLOAD = `https://github.com/vishutdhar/koegaki-releases/releases/download/${ARCHIVE_TAG}`;

/** The archived installers, oldest first, with the size and digests of each. */
export const WINDOWS_ARCHIVE = Object.freeze([
  Object.freeze({
    name: "Koegaki-1.2.1-setup.exe",
    size: 10822357,
    sha256: "a826527457a6858b7e882144b6ff9ba631080527a89da4e451879f5643e7b3c2",
    blake2b512: "3875ea9670356c71ef758f5d8871a4a66600f4a35bb8148186beb957826e6bd9b8a8494eb1f735f60a40dc45e6f2657f77f28b25a3f38878494b3eb66f3b181d",
  }),
  Object.freeze({
    name: "Koegaki-1.3.0-setup.exe",
    size: 10841490,
    sha256: "869b30e601ef8c32f9c0212b2622947de4b3a57c8a180d6c67fa14f585e27233",
    blake2b512: "158d8917b938a71a44b63ab882d8fab7b31bbf2c334306909707d6f49c810db5cc7f323866186338206409416e42388f53bc267b0a41c5bee8a082a3781d1cc0",
  }),
  Object.freeze({
    name: "Koegaki-1.4.0-setup.exe",
    size: 14282318,
    sha256: "812ffeb966c75fa4daa5c321dfb023200ff23ca25db4f9beeeed223d1fdbb980",
    blake2b512: "3acb8a19e9f7ea16d9def25daaf33c1a58ef2b2cf77c2010319e92d09ae441cd455a1876dbd838a2dbac76a048fc86b69a4facecffb92ee692a77ead0cdc9ef8",
  }),
  Object.freeze({
    name: "Koegaki-1.5.0-setup.exe",
    size: 14411590,
    sha256: "a4065c85e9189b8cbcd657642998bb50133b2e1c480eaf7ffec570e19757e452",
    blake2b512: "03da9dbab5a7bd06b98370ccfdde402cdb15f0457f74e247d75110e82d70ae77dc69580be433122f2d713c38c0bce5298d41f0fef1be79c07e66ef66dfdf462d",
  }),
  Object.freeze({
    name: "Koegaki-1.5.1-setup.exe",
    size: 14419726,
    sha256: "cc7ee5e1aaae86986a867c77b9cddddffb09c281d5e8fd85ac399e20274bee5b",
    blake2b512: "6743638e7d2ce8569a66fb5964289d53c6824f227ca3e81487607f871e56bb84332e9361c643ee2cb6228f87e37fb5426df08bca87c10198dd2e9c915e3ea532",
  }),
  Object.freeze({
    name: "Koegaki-1.5.2-setup.exe",
    size: 14461758,
    sha256: "deb829c0acc4e820f0a3cf52941c8d46f87beba36c602e8859c30ce47341d8c4",
    blake2b512: "0bba2c5699c707d01ed5d67b788d0d227016f7152adac1535adfd3cfc429380f7833e88d835f1b89a6955cd4079e9cf9c41a1cf87718fc0741f8d344639a90de",
  }),
  Object.freeze({
    name: "Koegaki-1.6.0-setup.exe",
    size: 14459557,
    sha256: "8ab62bdc2a8e59f69cf1482b4ace9d1507da2543c66e720b42e3e10540d4d393",
    blake2b512: "9369d7f5cba1cef8f28cda3c48d68d92409841815f85969e5d6e5de705a81b9c5b26e003260d37a1f698d745ff44591fa8eca1c5c01892ee159b6746e119c746",
  }),
  Object.freeze({
    name: "Koegaki-1.7.0-setup.exe",
    size: 14498223,
    sha256: "278f24aba15f24460713af919ed24eeef57598e6add8913327d921f2555d1807",
    blake2b512: "514236c493318fea28febe5a154ae3ffd611507f1b9ff005e75630faf6bd0fc11a878dd04b5f1e2fd8e1844ecc2eb3a8df660d01d0bfe320210e1e695519f4d7",
  }),
  Object.freeze({
    name: "Koegaki-1.7.1-setup.exe",
    size: 14495621,
    sha256: "ebe5d70852ec2bf15e44ab62424b810a8bbc2809e74cc9eecd586a9d37c8cb74",
    blake2b512: "b7cfddbbee1a86c7bc4dac59887d80212d3f17df608c2aef4a92effd0132fc336e9b0149decd7d56486a89ac5b3cd34e140ad4c764e2dbd299a105eccc8ecc76",
  }),
  Object.freeze({
    name: "Koegaki-1.8.0-setup.exe",
    size: 14530748,
    sha256: "f05b79ad314643c711eacc8c2212a6c8f893bea0a46bf96f40c2f02b9f6e2e90",
    blake2b512: "1f13639cc6741dca469d8a80808802c3cfbd5a4d53e67e2d1ebb884f44dd1e8620ff1a17a54104a06a0d51c38cf0dc15d1aed13b2fb04f73c0cbf397f20b9d82",
  }),
  Object.freeze({
    name: "Koegaki-1.8.1-setup.exe",
    size: 14524650,
    sha256: "b8f2aa609798efec9a6328f36584372997603795175ec46f7f892877f30669c9",
    blake2b512: "43c94099666e46827bd0439e655a5246a8f0f4808471de2b48c3ed6e080102990ee29b3756313d2f25d3618d3dbaf2fd1fb75957276a232f06356718f1ceeb21",
  }),
  Object.freeze({
    name: "Koegaki-1.9.0-setup.exe",
    size: 14549506,
    sha256: "6e615e831afe980942930cb5f0cba66f6736a4c2c058743ca90a9f7bbe0a7d31",
    blake2b512: "78b90c44764da8cf73393099e78fb8322571fa1e770a50e86d8151eae0268c204ec68124698d6ebb86e5ab77be5a63ed6882e764e9d48efa251b12bc8ef88718",
  }),
]);

/** The url of the archived installer named `name`. */
export const archiveAssetUrl = (name) => `${ARCHIVE_DOWNLOAD}/${name}`;

/** The archive entry of `name`, or undefined. */
export const archiveEntry = (name) => WINDOWS_ARCHIVE.find((entry) => entry.name === name);

/**
 * The status of the redirect from koegaki.com/downloads/<name>: permanent, and
 * followed by every client (see the top of this file).
 * @type {301}
 */
export const ARCHIVE_REDIRECT_STATUS = 301;

/**
 * The redirects next.config.ts serves: /downloads/<name> to the asset of the
 * same name, with ARCHIVE_REDIRECT_STATUS, for each archived installer, named
 * one by one, so a name that is not archived matches none of them and stays a
 * 404.
 * @returns {{ source: string, destination: string, statusCode: 301 }[]}
 */
export function archiveRedirects() {
  return WINDOWS_ARCHIVE.map(({ name }) => ({ source: `/downloads/${name}`, destination: archiveAssetUrl(name), statusCode: ARCHIVE_REDIRECT_STATUS }));
}
