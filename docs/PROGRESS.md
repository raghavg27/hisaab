# Build progress

Autonomous v1 build of the PRD (`Hisaab - PRD.md`), in milestone order (§16).
Update this file after every step so a resumed session knows where to pick up.

## Decisions / assumptions
- pnpm workspaces; TypeScript 5.9 (TS 7 native compiler is too new for Next's build).
- Google login skipped for now (behind `NEXT_PUBLIC_GOOGLE_AUTH`); email OTP + anonymous are the working auth methods.
- Docker is not installed, so pgTAP tests run against the linked project through psql: `pnpm test:db` (each file rolls back).
- Supabase project ref `szraywvfetowvdwhlsoi`; Vercel project `raghavg27s-projects/hisaab` (root `apps/web`), public URL https://hisaab-liart-kappa.vercel.app.
- Live-night routes use `?id=` (`/app/s?id=…`, `/app/s/count?id=…`) instead of `/app/s/[id]` so a static shell can be cached and opened in airplane mode. Same for `/app/g?id=`.
- Free-tier Supabase blocks custom email templates without SMTP, so the email carries a magic link; the 6-digit code field works once SMTP + `supabase/templates/otp.html` are enabled.
- Projection is a full replay each time (well under the 5 ms budget for 1,000 events), not incremental.
- Results in share text are ranked by P&L (§8.10), so the golden text lists Sana before Rohit.
- Background Sync is not used: the SW can't read the Supabase session; flush runs on online/visibility/10 s instead.
- The once-a-day splash plays on `/app` (the PWA start_url), not on the public landing page: on `/` it cost Lighthouse performance 60 (3D chunk + covered LCP). It never loads on deep links such as the Live Table.
- The Live Table loads ~354 KB gzipped JS against the §12 budget of 170 KB. React + Next alone are ~125 KB; supabase-js, Dexie, Motion and zod (all PRD stack) make up most of the rest. No Three.js or GSAP is on the route. Trimmed with zod/mini and a lazy QR code; meeting 170 KB would need dropping parts of the mandated stack.
- `--text-3` is `#887F6E` instead of the PRD's `#7A7262`: the original is 4.2:1 on bg and fails WCAG AA for 12px captions.

## M0 Foundation
- [x] pnpm monorepo scaffold
- [x] packages/ledger: core math (port of §5.7)
- [x] packages/ledger: event types + zod schemas
- [x] packages/ledger: projection + voiding + validation (canApply)
- [x] golden test (§5.6) + property tests (§14.1) + validation tests
- [x] apps/web scaffold with tokens/fonts
- [x] CI workflow (tests, typecheck, lint, build; E2E + Lighthouse once repo secrets exist)

## M1 Local night
- [x] Dexie schema + local repository
- [x] New night wizard
- [x] Live Table + all actions (top-up, short, repay, leave, rejoin, add player)
- [x] Undo toast / void / fix via log
- [x] Bank check, table lock, keypad, typo guard
- [x] Count + gap resolution
- [x] Settlement (both views) + share text
- [x] PWA (Serwist) offline shell

## M2 Accounts & sync
- [x] Supabase schema + RLS + RPCs
- [x] Auth (email OTP/magic link), onboarding (name + 18+)
- [x] Groups, members, invites, claiming
- [x] Outbox sync + Realtime
- [x] Viewer link

## M3 Trust features
- [x] Host handover, bank handover, combined leave wizard
- [x] Force takeover, epochs, heartbeat, rejected-events notice
- [x] verify-and-close edge function

## M4 History & stats
- [x] Night detail, group leaderboard + festive season, personal stats, CSV export

## M5 Look & feel
- [x] Splash (R3F) + reveal (GSAP + R3F) with fallbacks
- [x] Landing page, share image card, Hinglish, sounds, install prompts

## M6 Launch
- [x] Legal pages, analytics, a11y pass, Lighthouse CI, prod env + deploy
- [ ] Sentry (optional, skipped)

## Status
v1 is built and deployed. Verified: ledger 30 unit tests, web 12 unit tests, 14 pgTAP RLS tests,
24 E2E runs (§14.3 #1–9 + extras on Pixel 7 and iPhone 14), Lighthouse on `/` 99/100/96 in production.

## Needs the owner
- Add SMTP (e.g. Resend) in Supabase Auth, then uncomment the email template in `supabase/config.toml` so emails carry the 6-digit code and the send limit rises.
- Google login: create OAuth credentials, add them in Supabase, set `NEXT_PUBLIC_GOOGLE_AUTH=true` in Vercel.
- Enable Web Analytics in the Vercel dashboard (Project → Analytics); the API can't toggle it, so the script 404s until then.
- Add repository secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` to run E2E + Lighthouse in CI.
- Have a lawyer review `/legal/terms` and `/legal/privacy`, and add a privacy contact address.

## Not done
- Visual regression snapshots (§14.4): baselines differ between macOS and the Linux CI runner; not added.
- Unit-level sync tests with fake IndexedDB (§14.2); the same behaviours are covered end to end (offline, takeover, viewer).
