# koegaki-web

The public site for [Koegaki](https://koegaki.com) — local, private voice-to-text for Mac,
sold direct for $29 with a 30-day trial. Next.js 16 (App Router) + Tailwind v4, deployed on
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
npm run build    # production build (also what Vercel runs)
```

This is a current Next.js major — check `node_modules/next/dist/docs/` before assuming
conventions from older versions (see `AGENTS.md`).

## Conventions

- No AI-assistant references in commits, comments, or docs.
- Every change ships through a PR (`quick-pr`); Codex reviews; `main` is push-protected.
- The Mac app itself lives in the private `Koegaki` repo; its release procedure is
  `docs/RELEASE-1.0-runbook.md` there.
