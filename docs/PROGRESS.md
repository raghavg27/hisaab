# Build progress

Autonomous v1 build of the PRD (`Hisaab - PRD.md`), in milestone order (§16).
Update this file after every step so a resumed session knows where to pick up.

## Decisions / assumptions
- pnpm workspaces; TypeScript 5.9 (TS 7 native compiler is too new for Next's build).
- Google login skipped for now (behind `NEXT_PUBLIC_GOOGLE_AUTH`); email OTP + anonymous are the working auth methods.
- Docker is not installed, so pgTAP tests run against the remote project via `supabase test db --db-url`.
- Supabase project ref `szraywvfetowvdwhlsoi`; Vercel project `raghavg27s-projects/hisaab`.

## M0 Foundation
- [ ] pnpm monorepo scaffold
- [ ] packages/ledger: core math (port of §5.7)
- [ ] packages/ledger: event types + zod schemas
- [ ] packages/ledger: projection + voiding + validation (canApply)
- [ ] golden test (§5.6) + property tests (§14.1) + validation tests
- [ ] apps/web scaffold with tokens/fonts
- [ ] CI workflow

## M1 Local night
- [ ] Dexie schema + local repository
- [ ] New night wizard
- [ ] Live Table + all actions (top-up, short, repay, leave, rejoin, add player)
- [ ] Undo toast / void / fix via log
- [ ] Bank check, table lock, keypad, typo guard
- [ ] Count + gap resolution
- [ ] Settlement (both views) + share text
- [ ] PWA (Serwist) offline shell

## M2 Accounts & sync
- [ ] Supabase schema + RLS + RPCs
- [ ] Auth (email OTP, anonymous), onboarding (name + 18+)
- [ ] Groups, members, invites, claiming
- [ ] Outbox sync + Realtime
- [ ] Viewer link

## M3 Trust features
- [ ] Host handover, bank handover, combined leave wizard
- [ ] Force takeover, epochs, heartbeat, rejected-events notice
- [ ] verify-and-close edge function

## M4 History & stats
- [ ] Night detail, group leaderboard + festive season, personal stats, CSV export

## M5 Look & feel
- [ ] Splash (R3F) + reveal (GSAP + R3F) with fallbacks
- [ ] Landing page, share image card, Hinglish, sounds, install prompts

## M6 Launch
- [ ] Legal pages, analytics, a11y pass, Lighthouse CI, Sentry (optional), prod env + deploy
