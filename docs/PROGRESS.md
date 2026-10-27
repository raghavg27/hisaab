# Build progress

Autonomous v1 build of the PRD (`Hisaab - PRD.md`), in milestone order (§16).
Update this file after every step so a resumed session knows where to pick up.

## Decisions / assumptions
- pnpm workspaces; TypeScript 5.9 (TS 7 native compiler is too new for Next's build).
- Google login skipped for now (behind `NEXT_PUBLIC_GOOGLE_AUTH`); email OTP + anonymous are the working auth methods.
- Docker is not installed, so pgTAP tests run against the remote project via `supabase test db --db-url`.
- Supabase project ref `szraywvfetowvdwhlsoi`; Vercel project `raghavg27s-projects/hisaab`.
- Live-night routes use `?id=` (`/app/s?id=…`, `/app/s/count?id=…`) instead of `/app/s/[id]` so a static shell can be cached and opened in airplane mode. Same for `/app/g?id=`.
- Free-tier Supabase blocks custom email templates without SMTP, so the email carries a magic link; the 6-digit code field works once SMTP + `supabase/templates/otp.html` are enabled.
- Projection is a full replay each time (well under the 5 ms budget for 1,000 events), not incremental.
- Results in share text are ranked by P&L (§8.10), so the golden text lists Sana before Rohit.
- Background Sync is not used: the SW can't read the Supabase session; flush runs on online/visibility/10 s instead.

## M0 Foundation
- [x] pnpm monorepo scaffold
- [x] packages/ledger: core math (port of §5.7)
- [x] packages/ledger: event types + zod schemas
- [x] packages/ledger: projection + voiding + validation (canApply)
- [x] golden test (§5.6) + property tests (§14.1) + validation tests
- [x] apps/web scaffold with tokens/fonts
- [ ] CI workflow

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
- [ ] Groups, members, invites, claiming
- [x] Outbox sync + Realtime
- [ ] Viewer link

## M3 Trust features
- [x] Host handover, bank handover, combined leave wizard
- [x] Force takeover, epochs, heartbeat, rejected-events notice
- [ ] verify-and-close edge function

## M4 History & stats
- [ ] Night detail, group leaderboard + festive season, personal stats, CSV export

## M5 Look & feel
- [x] Splash (R3F) + reveal (GSAP + R3F) with fallbacks
- [ ] Landing page, share image card, Hinglish, sounds, install prompts

## M6 Launch
- [ ] Legal pages, analytics, a11y pass, Lighthouse CI, Sentry (optional), prod env + deploy

## Next up
- Groups list/detail (members, invites, settings, leaderboard), history, me, viewer `/v/[token]`, join `/join/[token]`, legal pages
- verify-and-close edge function; Hinglish translations; E2E (Playwright) + RLS tests; CI; deploy
