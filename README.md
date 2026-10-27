# koegaki-web

The public site for [Koegaki](https://koegaki.com) — local, private voice-to-text for Mac,
sold direct for $30 with a 30-day trial. Next.js 16 (App Router) + Tailwind v4, deployed on
Vercel. Pushes to `main` auto-deploy to production via the Git integration.

## How money and downloads flow

- `/buy` (`app/buy/route.ts`) 307-redirects to the Lemon Squeezy checkout. The Mac app's
  Buy buttons open `koegaki.com/buy`, so the checkout provider or URL can change without an
  app update. While `NEXT_PUBLIC_CHECKOUT_URL` is unset the route falls back to the home
  page (never a dead link).
- The download button serves the notarized `Koegaki-<version>.dmg` from
  `NEXT_PUBLIC_DOWNLOAD_URL`.
- All site constants (price, trial length, URLs, support email) live in `lib/site.ts`
  (exported as `SITE`); the env vars override the checkout/download URLs per environment.

## Environment variables

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_CHECKOUT_URL` | Lemon Squeezy checkout link (the `/buy` redirect target) |
| `NEXT_PUBLIC_DOWNLOAD_URL` | Direct URL of the notarized DMG |

Set in Vercel project settings; env changes need a redeploy to take effect.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # production build (Vercel runs next build via vercel.json, see next.config.ts)
```

This is a current Next.js major — check `node_modules/next/dist/docs/` before assuming
conventions from older versions (see `AGENTS.md`).

## Conventions

- No AI-assistant references in commits, comments, or docs.
- Every change ships through a PR (`quick-pr`) with automated review; `main` is
  push-protected.
- The Mac app itself lives in the private `Koegaki` repo; its release procedure is
  `docs/RELEASE-1.0-runbook.md` there.

## Mac releases: canary first

Every Mac release is first offered only in the Sparkle channel `canary`, which only Macs that opted in
take (spec `docs/superpowers/specs/2026-10-25-mac-forward-rollback-and-canary.md` in the Koegaki repo).
Its pull request here carries the appcast item with `<sparkle:channel>canary</sparkle:channel>`, the
record `releases/<version>.json` with `"channel": "canary"`, and the `MAC_BUILDS` line, and leaves the
Mac download link in `lib/site.ts` where it is. After about a day on the owner's Macs, the Koegaki
repo's `Tools/promote-release.sh <version>` opens the pull request that gives it to everyone: the
channel line leaves the item and the record, and the Mac link moves to it. The tests refuse an item and
a record that disagree, a channel Sparkle cannot read, and a Mac link that names a canary release.
A rollback is a forward release (a new, higher version of earlier code) and usually goes to everyone at
once.
