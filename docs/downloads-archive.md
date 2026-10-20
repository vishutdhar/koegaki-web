# The Windows installer archive and the /downloads redirects

## What changed (October 2026)

koegaki.com served the Windows installers of Koegaki 1.2.1 to 1.9.0 as twelve
static files in `public/downloads`. Every production deployment stored all of
them, 166,297,544 bytes, which twice pushed the Vercel team's deployment
storage past its alarm. They now live in one GitHub release of their own:

- Release: https://github.com/vishutdhar/koegaki-releases/releases/tag/windows-archive
  (tag `windows-archive`, immutable, not marked Latest).
- Each `https://koegaki.com/downloads/<name>` answers a 301 to
  `https://github.com/vishutdhar/koegaki-releases/releases/download/windows-archive/<name>`,
  which GitHub answers with a 302 to its asset host, which serves the bytes.
- `scripts/windows-archive.mjs` lists the twelve names with the size, SHA-256
  and BLAKE2b-512 of each. `next.config.ts` builds one redirect per name from
  it, so any other path under `/downloads` stays a 404.
- `public/downloads` does not exist, and must not. `scripts/check-release-downloads.mjs`,
  which `vercel.json` runs before every build, fails the build if anything is
  there, and the site tests fail too.
- Git history keeps the files; commit `6d130a7` holds all twelve.

The release was created as a draft, each asset was checked against the files
(API digest, and a download compared byte for byte), and only then published.
After publishing, each asset url was downloaded anonymously and its SHA-256
compared again.

## Who fetches these urls, and why each one follows the redirect

| Client | What it runs | Follows the redirect | Evidence |
| --- | --- | --- | --- |
| winget, the four merged manifests (1.2.1, 1.4.0, 1.5.0, 1.5.1) | Delivery Optimization first, then WinINet | yes | below |
| Koegaki's Windows updater, 1.2.1 to 1.9.0 | tauri-plugin-updater 2.10.1, reqwest 0.13.4, tower-http 0.6.11 | yes, but it never asks these urls | below |
| Browsers, curl, PowerShell 7 | their own HTTP stacks | yes | RFC 9110 section 15.4.2 |
| Windows PowerShell 5.1, Chocolatey and other .NET Framework tools | HttpWebRequest | yes for 301, no for 308 | below |

**winget.** In microsoft/winget-cli, `src/AppInstallerCommonCore/Downloader.cpp`
downloads an installer with Delivery Optimization, and on any error except four
policy blocks (cost, cellular, power state, no network; `IsDOErrorFatal` in
`DODownloader.cpp`) it falls back to WinINet. The WinINet path calls
`InternetOpenUrl` with only `INTERNET_FLAG_IGNORE_REDIRECT_TO_HTTPS`, without
`INTERNET_FLAG_NO_AUTO_REDIRECT`, so WinINet follows redirects itself, and the
download succeeds only on a final 200. Every winget manifest of Koegaki from
1.10.0 on installs from a github.com release url, which redirects, so winget
already installs Koegaki through a redirect. The SHA-256 each of the four
manifests states equals the archive's entry for that file (the site tests pin
all four), because the bytes are the same.

**The Windows updater of the archived versions.** The Cargo.lock of every
release from 1.2.1 to 1.9.0 (`apps/KoegakiWindows/Cargo.lock` in the Koegaki
repo, at the release commits c535cf85 to 669af161) pins tauri-plugin-updater
2.10.1, reqwest 0.13.4 and tower-http 0.6.11. The updater builds its client
with `ClientBuilder::new()` and changes no redirect policy, and Koegaki sets no
`configure_client`; reqwest's default policy is `Policy::limited(10)`, and
tower-http's `FollowRedirect` follows 301, 302, 303, 307 and 308. In practice
the updater never asks these urls: it reads `https://koegaki.com/windows-updates.json`,
and no version of that manifest has ever pointed at `koegaki.com/downloads`
(every one named the Vercel Blob host or GitHub).

**Why 301, not 308.** Both are permanent. 308 differs only in keeping a POST a
POST, and every client here sends GET. The .NET Framework's `HttpWebRequest`
(microsoft/referencesource, `System/net/System/Net/HttpWebRequest.cs`,
`CheckResubmit`) follows 300, 301, 302, 303 and 307 and stops at a 308, so a
308 would break a download from Windows PowerShell 5.1 or any package tool
built on that stack. WinINet follows 308 only from Windows 10 (browser
compatibility data for Internet Explorer 11: "Does not work below Windows 10").
A 301 is followed by all of them.

## Edge cases, measured on a preview deployment

- A redirect passes the query string on, and a trailing slash first gets
  Next's own 308 to the path without it, then the 301.
- Next and Vercel match redirects whatever the case of the path, so
  `/downloads/koegaki-1.2.1-setup.exe` also answers 301 to the canonical asset
  (the site tests pin this). It used to be a 404, since static files are
  looked up case sensitively. It can only ever reach the asset of the same
  name, never another file.
- A percent-encoded spelling of a name, such as `Koegaki-%31.2.1-setup.exe`,
  used to reach the file, because the static file lookup decodes the path, and
  is now a 404, because redirects match the path as sent. No client encodes
  letters, digits, dots or hyphens (RFC 3986 section 6.2.2.2 has them
  decoded), and every link and manifest names the plain url.
- Any other path under `/downloads` is a 404, as before.

## How to check it

- Offline, `npm test`: the routes manifest of the build holds exactly the
  twelve redirects with status 301 and nothing else under `/downloads`;
  `public/downloads` does not exist and `public/` holds no release file; the
  archive table matches the winget manifests and `releases/1.9.0.json`.
- Online, `RELEASE_FETCH=1 npm test`: each `koegaki.com/downloads/<name>`
  answers 301 to its asset, and following it yields the bytes the table
  states; paths under `/downloads` that are not archived answer 404. Set
  `RELEASE_FETCH_ORIGIN` to a preview deployment's origin to check a change
  before it reaches koegaki.com.
