# Hisaab — Teen Patti Game Night Tracker

**PRD v1.0 · 28 Oct 2026 · Owner: Raghav Gupta**
Working name "Hisaab" (हिसाब — the reckoning). Keep it in one constant (`APP_NAME`) so it's easy to rename.

---

## 0. Read this first (instructions for Claude Code)

1. **The money math is the product.** Build `packages/ledger` first, as pure TypeScript with zero dependencies. Make the golden test in §5.6 and the property tests in §14.1 pass before you write any UI. Every screen reads from this package and nothing else.
2. **Event-sourced, append-only.** All game state is derived by replaying an ordered list of events. Never update or delete an event. Corrections are new `EVENT_VOIDED` / `ADJUSTMENT` events.
3. **Offline-first, single writer.** Only the current host's device writes events for a game. It writes to IndexedDB first, then syncs to Supabase whenever the network is available. Everyone else reads.
4. **Integers only.** All amounts are whole rupees stored as `integer`. No floats anywhere in money code.
5. **No payments.** The app never moves, holds, requests or links to money. No UPI links, no payment SDKs. It only records what people did with cash at the table.
6. **Mobile first.** Design for a 360–430px wide Android phone held in one hand, in a dim room, late at night. Desktop is a centered 480px column.
7. Build in the milestone order in §16. Everything in this document is in scope for v1.

---

## 1. Problem

At a teen patti night, one person acts as the **bank**: they collect cash and hand out chips. Over a long night, people top up, run out and borrow chips from the bank on credit ("shorts"), pay some shorts back, leave early, come back. All of this is held in people's heads or on a scrap of paper. At the end:

- The final count rarely matches. Nobody can say where the gap is.
- Shorts get forgotten or disputed ("I paid you back at 11").
- Someone can quietly under-report a short or over-report their chips.
- Working out who pays whom takes 20 minutes and still ends in an argument.

## 2. Goals

| Goal | Measure |
|---|---|
| Set up a night in under a minute | Median time from "New night" to first Live Table < 60 s |
| Recording an event is faster than remembering it | Top-up ≤ 2 taps, short ≤ 3 taps, repay ≤ 3 taps |
| End-of-night always reconciles | 100% of closed nights have a zero gap (or an explicit, logged adjustment) |
| Settlement takes under 2 minutes | From "End game" to settlement screen < 2 min for 6 players |
| Trust | Every change is visible to every viewer in the log, with who/when |
| Works with no signal | A full night can be played start to finish in airplane mode |

## 3. Non-goals

- No payments, UPI links, wallets or money transfers of any kind.
- No per-hand or per-chaal tracking. No card dealing, no game engine, no odds.
- No native app-store builds. PWA only.
- No chat, no social feed, no ads.
- No multi-writer editing. One host device writes at a time.

## 4. Glossary and roles

| Term | Meaning |
|---|---|
| **Night / Session** | One game night. Has a fixed buy-in amount. |
| **Group** | A saved set of people who play together ("Diwali Gang"). Every night belongs to a group. |
| **Member** | A person in a group (nickname + color). May or may not be linked to a user account. |
| **Host** | The logged-in user whose phone records everything. Exactly one at a time. Can hand over. |
| **Bank / Bank holder** | The member physically holding the cash. Often the host, but can be someone else. |
| **Buy-in** | Player pays the bank cash, gets the same value in chips. Fixed amount per night. |
| **Top-up** | Another buy-in mid-game. Same amount as the buy-in. Can repeat. |
| **Short** | Player takes chips from the bank **on credit** (no cash paid). Any amount. Creates a debt to the bank. |
| **Repay** | Paying back some or all of a short mid-game, either in **cash** or by **returning chips**. |
| **Leave** | Player stops playing: counts chips and settles with the bank on the spot. |
| **Rejoin** | A player who left comes back the same night. Starts a new **stint** with a fresh buy-in. |
| **Stint** | One continuous period of a player at the table. A player can have several stints in a night. |
| **Final count** | At the end, each player's chip total is entered. |
| **Gap** | Difference between chips counted and chips that should be on the table. |
| **Viewer** | Anyone with the live link. Read-only. No login needed. |

**Roles and permissions**

| Action | Host | Group admin | Member (logged in) | Viewer (link) |
|---|---|---|---|---|
| Record events in a live night | ✅ | — | — | — |
| Hand over host | ✅ | — | — | — |
| Force take over a stuck night | — | ✅ | — | — |
| See live table + full log | ✅ | ✅ | ✅ | ✅ |
| Edit group, members, defaults | — | ✅ (owner too) | — | — |
| Claim a member profile as "me" | — | — | ✅ | ✅ (after login) |
| See group history & leaderboard | ✅ | ✅ | ✅ | — |

---

## 5. Money model (source of truth)

### 5.1 Per-stint counters

Replaying a stint's events produces these counters:

```
buyIns        Σ BUY_IN amounts
topUps        Σ TOP_UP amounts
shortsTaken   Σ SHORT_TAKEN amounts
repaidCash    Σ SHORT_REPAID where method = cash
repaidChips   Σ SHORT_REPAID where method = chips
final         chip count at LEAVE or FINAL_COUNT (null until then)
adj           Σ ADJUSTMENT amounts (gap resolution only)
settledNow    signed cash that changed hands at LEAVE (+ bank paid player, − player paid bank)
```

### 5.2 Derived values

```
chipsIssued      = buyIns + topUps + shortsTaken
netChips         = chipsIssued − repaidChips          // chips this stint took off the bank, net
cashIn           = buyIns + topUps + repaidCash       // cash this stint put into the bank
shortOutstanding = shortsTaken − repaidCash − repaidChips
effFinal         = final + adj
bankOwes         = effFinal − shortOutstanding        // + bank pays player, − player pays bank
pnl              = effFinal − netChips                // the player's result for this stint
deferred         = left ? bankOwes − settledNow : 0   // unsettled part of an early leave
```

A player's result for the night = Σ `pnl` across their stints.

### 5.3 Table-level values (shown live)

```
bankCash      = Σ(all stints) cashIn − Σ(left stints) settledNow
chipsOnTable  = Σ(all stints) netChips − Σ(left stints) final
shortsOut     = Σ(active stints) shortOutstanding
```

### 5.4 Reconciliation (the "does it match?" check)

At final count:

```
counted = Σ(active stints) effFinal
gap     = counted − chipsOnTable
```

- `gap = 0` → everything matches. Go to settlement.
- `gap < 0` → **₹|gap| missing from the table.** Likely causes: a chip repay or early leave not recorded, chips put away, miscount.
- `gap > 0` → **₹gap extra on the table.** Likely causes: a short or top-up not recorded, someone's own chips mixed in, miscount.

Settlement is blocked until the gap is 0. Ways to fix it (§8.9): recount, find the missing event in the log, or **accept an adjustment** (`ADJUSTMENT` events whose amounts sum to `−gap`). Adjustment options:

1. Bank holder absorbs it (one adjustment on the bank holder's stint).
2. Split equally among players at the table (remainder ₹1 at a time in seat order).
3. Assign it to a specific player.

Adjustments are marked ⚠ in the results, the log and the shared summary.

**Invariant:** once the gap is 0, Σ `pnl` over every stint in the night = 0 exactly.

### 5.5 Settlement

Build one balance per person (positive = receives, negative = pays):

```
for each person p:  position[p] = Σ bankOwes (their active stint) + Σ deferred (their left stints)
bank holder:        position[bankHolder] −= bankCash
```

Σ positions = 0 after reconciliation. Two views of the same numbers:

- **Fewest payments (default).** Run `minimizeTransfers(position)` (§5.7). Output like "Amit → Rohit ₹1,100". Never more than (people with non-zero balance − 1) transfers.
- **Via bank.** Each player settles with the bank holder only: "Bank pays Rohit ₹1,100", "Priya pays bank ₹200". This matches how the cash physically sits, for groups that prefer it.

**Early leave ("settle on the spot").** On leave, the app shows `bankOwes` for that stint. The default is to settle it in full: `settledNow = bankOwes`. If the bank doesn't have enough cash, or the leaver can't pay, the host enters a partial amount. The remainder (`deferred`) automatically becomes part of that person's final-settlement position. The UI must warn when `bankOwes > bankCash` ("Bank only has ₹2,300. Pay ₹2,300 now and ₹200 at the end?").

### 5.6 Golden worked example (must be a unit test)

Buy-in ₹500. Amit is host and bank holder. Five players.

| # | Event | Bank cash | Chips on table |
|---|---|---|---|
| 1 | Amit, Rohit, Priya, Kunal, Sana buy in ₹500 each | 2,500 | 2,500 |
| 2 | Rohit takes a short of ₹300 | 2,500 | 2,800 |
| 3 | Kunal tops up ₹500 | 3,000 | 3,300 |
| 4 | Rohit repays ₹200 of his short in cash | 3,200 | 3,300 |
| 5 | Sana leaves with 900 chips, no short → bank pays her ₹900 | 2,300 | 2,400 |
| 6 | Sana rejoins, buys in ₹500 | 2,800 | 2,900 |
| 7 | Priya takes a short of ₹200 | 2,800 | 3,100 |

Final count: Amit 300, Rohit 1,200, Priya 0, Kunal 1,000, Sana 600 = **3,100 → gap 0** ✅

| Player | netChips | shortOutstanding | final | bankOwes | P&L |
|---|---|---|---|---|---|
| Amit | 500 | 0 | 300 | 300 | −200 |
| Rohit | 800 | 100 | 1,200 | 1,100 | +400 |
| Priya | 700 | 200 | 0 | −200 | −700 |
| Kunal | 1,000 | 0 | 1,000 | 1,000 | 0 |
| Sana (stint 1, settled) | 500 | 0 | 900 | 900 (paid) | +400 |
| Sana (stint 2) | 500 | 0 | 600 | 600 | +100 |

Σ P&L = 0 ✅. Sana's night = +500.

Positions: Amit −2,500 (holds the bank's ₹2,800, owed ₹300), Rohit +1,100, Priya −200, Kunal +1,000, Sana +600.

Fewest payments (expected output, exactly this order):
1. Amit → Rohit ₹1,100
2. Amit → Kunal ₹1,000
3. Amit → Sana ₹400
4. Priya → Sana ₹200

Gap test: if Kunal's count is entered as 900 instead, the app must show "₹100 missing from the table".

### 5.7 Reference implementation

This exact code was run against the golden example. An equivalent JS version was run against 40,000 randomized nights; half of those included partial on-the-spot settlements and adjusted gaps, and all included rejoins and both repay methods. Every invariant in §14.1 held, including "every person's cash in/out equals their P&L". Port it into `packages/ledger` as-is (types tightened), then extend it with event voiding.

```ts
// packages/ledger/src/core.ts
export type Method = 'cash' | 'chips';

export interface Stint {
  id: string; memberId: string;
  buyIns: number; topUps: number; shortsTaken: number;
  repaidCash: number; repaidChips: number;
  final: number | null; adj: number; left: boolean; settledNow: number;
}

export function derive(s: Stint) {
  const chipsIssued = s.buyIns + s.topUps + s.shortsTaken;
  const netChips = chipsIssued - s.repaidChips;
  const cashIn = s.buyIns + s.topUps + s.repaidCash;
  const shortOutstanding = s.shortsTaken - s.repaidCash - s.repaidChips;
  const eff = s.final === null ? null : s.final + s.adj;
  const bankOwes = eff === null ? null : eff - shortOutstanding;
  const pnl = eff === null ? null : eff - netChips;
  const deferred = s.left && bankOwes !== null ? bankOwes - s.settledNow : 0;
  return { chipsIssued, netChips, cashIn, shortOutstanding, bankOwes, pnl, deferred };
}

export function tableTotals(stints: Stint[]) {
  let bankCash = 0, chipsOnTable = 0, shortsOut = 0;
  for (const s of stints) {
    const d = derive(s);
    bankCash += d.cashIn;
    chipsOnTable += d.netChips;
    if (s.left) { bankCash -= s.settledNow; chipsOnTable -= s.final!; }
    else shortsOut += d.shortOutstanding;
  }
  return { bankCash, chipsOnTable, shortsOut };
}

export function reconcile(stints: Stint[]) {
  const { chipsOnTable } = tableTotals(stints);
  const counted = stints.filter(s => !s.left).reduce((a, s) => a + (s.final ?? 0) + s.adj, 0);
  return { expected: chipsOnTable, counted, gap: counted - chipsOnTable };
}

/** positions: + receives, − pays. Must sum to 0. Deterministic. */
export function minimizeTransfers(positions: Record<string, number>) {
  const total = Object.values(positions).reduce((a, b) => a + b, 0);
  if (total !== 0) throw new Error(`positions sum to ${total}`);
  const cred = Object.entries(positions).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debt = Object.entries(positions).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out: { from: string; to: string; amount: number }[] = [];
  // Pass 1: exact matches remove a transfer each
  for (const d of debt) {
    const c = cred.find(c => c.v > 0 && c.v === d.v);
    if (c && d.v > 0) { out.push({ from: d.id, to: c.id, amount: d.v }); c.v = 0; d.v = 0; }
  }
  // Pass 2: greedy largest debtor → largest creditor; ties broken by id
  const byDesc = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  for (;;) {
    const D = debt.filter(x => x.v > 0).sort(byDesc);
    const C = cred.filter(x => x.v > 0).sort(byDesc);
    if (!D.length || !C.length) break;
    const amount = Math.min(D[0].v, C[0].v);
    out.push({ from: D[0].id, to: C[0].id, amount });
    D[0].v -= amount; C[0].v -= amount;
  }
  return out;
}

export function settlementPositions(stints: Stint[], bankHolderId: string) {
  const { bankCash } = tableTotals(stints);
  const pos: Record<string, number> = {};
  for (const s of stints) {
    const d = derive(s);
    const amt = s.left ? d.deferred : d.bankOwes!;
    if (amt !== 0 || !s.left) pos[s.memberId] = (pos[s.memberId] ?? 0) + amt;
  }
  pos[bankHolderId] = (pos[bankHolderId] ?? 0) - bankCash;
  return pos;
}
```

Notes:
- Tie-breaks must be by **member display name**, not UUID, so the output order is stable and matches the golden example. Either key `positions` by nickname (unique within a group), or add a `nameOf(id)` comparator argument. Use `localeCompare` with locale `en-IN`.
- Validation lives in the ledger, not the UI. The UI calls `canApply(state, event)` and shows the returned error. Rules:
  - Repay ≤ `shortOutstanding`.
  - Amounts > 0.
  - No events on a left stint.
  - One active stint per member.
  - No `FINAL_COUNT` before counting has started.
  - No leave while the player holds the bank (they must hand over first).

---

## 6. Event log

Every event is one row. The client generates the UUID and the sequence number. An event is never changed after it's written.

```ts
interface LedgerEvent {
  id: string;            // uuid v7 (time-ordered), client-generated
  sessionId: string;
  seq: number;           // 1,2,3… per session, assigned by host device; unique(sessionId, seq)
  hostEpoch: number;     // increments on every host change; stale-epoch writes are rejected
  type: EventType;
  payload: object;       // zod-validated per type
  actorUserId: string;
  clientTs: string;      // ISO; for display only — ordering is by seq
}
```

| Type | Payload | Notes |
|---|---|---|
| `SESSION_STARTED` | `{ title, buyIn, topUp, bankHolderMemberId, chipSet?, kitty? }` | `topUp` defaults to `buyIn` |
| `PLAYER_JOINED` | `{ stintId, memberId }` | Setup emits one per player, then `BUY_IN` |
| `BUY_IN` | `{ stintId, amount }` | |
| `TOP_UP` | `{ stintId, amount }` | |
| `SHORT_TAKEN` | `{ stintId, amount, note? }` | |
| `SHORT_REPAID` | `{ stintId, amount, method: 'cash' \| 'chips' }` | |
| `PLAYER_LEFT` | `{ stintId, finalChips, chipBreakdown?, settledNow }` | |
| `COUNTING_STARTED` / `COUNTING_REOPENED` | `{}` | Locks Live Table actions while counting |
| `FINAL_COUNT` | `{ stintId, finalChips, chipBreakdown? }` | Re-entry replaces the previous count (latest wins) |
| `ADJUSTMENT` | `{ stintId, amount, resolution: 'bank_absorbs' \| 'split_equal' \| 'assigned', gapAtTime }` | |
| `BANK_CHECK` | `{ counted, expected }` | Anyone can ask the host to run it |
| `BANK_TRANSFERRED` | `{ fromMemberId, toMemberId, counted, expected }` | Cash count is required on handover |
| `HOST_TRANSFERRED` | `{ fromUserId, toUserId, forced: boolean }` | Written by the server RPC |
| `TRANSFER_MARKED` | `{ from, to, amount, paid: boolean }` | Record-only tick; no money moves |
| `KITTY_MARKED` | `{ memberId, paid: boolean }` | Only if kitty is on (§8.11) |
| `SESSION_CLOSED` / `SESSION_REOPENED` | `{ reason? }` | Reopen requires a reason |
| `EVENT_VOIDED` | `{ targetId, reason: 'undo' \| 'wrong_amount' \| 'wrong_player' \| 'duplicate' \| 'other', note? }` | Projection skips the target |

**Projection.** `project(events) → { stints, totals, status, log }`. It is pure and memoized. Apply events incrementally as they arrive, and do a full replay when an event is voided. Performance target: 1,000 events projected in < 5 ms on a mid-range phone.

**Voiding.**
- Voiding `PLAYER_LEFT` reopens that stint.
- Voiding `BUY_IN` on a stint whose only event is that buy-in also voids the `PLAYER_JOINED`.
- Nothing can be voided after `SESSION_CLOSED` until the night is reopened.
- A "Fix" action emits `EVENT_VOIDED` and the corrected event together, linked by `note: "fix:<newId>"`.

---

## 7. Information architecture

| Route | Screen | Auth |
|---|---|---|
| `/` | Landing (marketing, SEO) | Public |
| `/login` | Sign in | Public |
| `/app` | Home: resume live night, groups, recent nights | User |
| `/app/new` | New night wizard | User |
| `/app/s/[id]` | Live Table (host) | Host |
| `/app/s/[id]/count` | Final count | Host |
| `/app/s/[id]/settle` | Reveal + settlement | Host |
| `/app/s/[id]/log` | Full event log | Group member / viewer |
| `/app/g/[id]` | Group: members, nights, leaderboard, settings | Group member |
| `/app/history` | All my nights, personal stats | User |
| `/app/me` | Profile, language, motion/sound, export, delete account | User |
| `/v/[viewToken]` | Viewer: live table, log, final settlement | Anonymous OK |
| `/join/[inviteToken]` | Join group / claim a member profile | User |
| `/legal/terms`, `/legal/privacy` | Legal pages | Public |

Bottom tab bar inside `/app`: **Home · Groups · History · Me**. Hide the tab bar on the Live Table, count and settle screens, where the screen's own bottom action bar takes over.

---

## 8. Features and flows

### 8.1 Onboarding and auth
- Supabase Auth with **Google** and **email OTP** (6-digit code, so it works from a phone without switching apps). Put **phone OTP** behind an env flag (`NEXT_PUBLIC_PHONE_AUTH`). It needs an SMS provider, which costs money.
- First sign-in: set display name, then tick a required checkbox: "I'm 18 or older and I'll use this to keep score with people I know." Store `age_confirmed_at`.
- Show a one-time, 3-card swipeable explainer ("Record shorts as they happen" / "Everyone sees the same log" / "End of night, sorted"). It can be skipped.
- PWA install prompt:
  - Android: `beforeinstallprompt`, offered after the first night is closed, not on first visit.
  - iOS: a sheet with Share → Add to Home Screen steps.

### 8.2 Groups and members
- Create a group: name, emoji, default buy-in, optional chip set.
- Members are nicknames, unique within a group, with an auto-assigned color from a 12-color palette. Suggest disambiguation for duplicates ("Rohit K").
- **Invite link** (`/join/[token]`, expires in 7 days): a logged-in person can join the group as a new member, or **claim** an existing unclaimed member ("I'm Rohit").
  - Claiming links all of that member's history to their account.
  - Admins can unlink a claim.
- Roles: owner (1), admins (any), members. Owner can transfer ownership.
- "Quick start" from Home creates a group named after the date ("Game night · 28 Oct"). It can be renamed and kept.

### 8.3 New night wizard (target < 60 s)
1. **Group.** Last-used group preselected.
2. **Who's playing.** Member chips to toggle on/off (last night's players preselected). An "Add person" inline field: type a name, press Enter, done. Drag to set seat order (optional, used for tie-breaks and split remainders).
3. **Amounts.**
   - Buy-in: group default, with quick presets ₹100 / 200 / 500 / 1,000 / custom.
   - Top-up: locked to the buy-in by default ("Same as buy-in" toggle).
   - Bank holder: defaults to the host's own member profile.
   - Chip counter (if the group has a chip set).
   - Kitty: off by default.
4. **Start.**
   - Emits `SESSION_STARTED`, then `PLAYER_JOINED` and `BUY_IN` for everyone.
   - Shows a one-line confirmation: "Bank should now hold ₹3,000 (6 × ₹500)".
   - Opens the Live Table.

Works fully offline. The new night syncs later.

### 8.4 Live Table (the core screen)

**Top bar.**
- Night title and elapsed time.
- Sync pill: `● Live`, or `◌ Offline · 3 to sync`, or `⟳ Syncing`.
- Share button: opens a sheet with a QR code and the view link.

**Summary strip.** Three tappable stats:
- **Bank ₹2,800.** Tapping opens Bank check.
- **On table ₹3,100**
- **Shorts out ₹300.** Tapping filters the list to players with shorts.

**Player list.** One card per active player, in seat order. Each card shows:
- Color avatar with initial, and nickname.
- "In ₹800" (netChips).
- Short badge in rani pink if outstanding: "Short ₹100".
- Tiny tags: 🏦 bank holder, 👑 host.
- **Inline buttons:**
  - `+ Top-up`: one tap opens a confirm sheet prefilled with ₹500. Confirm = 2nd tap.
  - `Short`: opens a sheet with quick amounts ₹100 / ₹200 / buy-in / custom keypad. Confirm = 3rd tap.
  - `⋯`: Repay short, Leave table, This player's log.

**Left section** (collapsed). Players who left, each showing their result and a `Rejoin` button. Rejoin creates a new stint plus a `BUY_IN`.

**Bottom action bar.** `+ Player` · `Log` · `End game`.

**After every action.**
- Haptic tick (`navigator.vibrate(10)` where supported).
- The number rolls to its new value.
- A toast with **Undo** shows for 6 s. Undo emits `EVENT_VOIDED{reason:'undo'}`.
- After the 6 s window, corrections go through the log ("Fix" or "Void", reason required).

**Typo guard.** Any single amount > 5 × buy-in asks for a second confirm: "₹5,000? That's 10 buy-ins."

**Table lock.** A lock icon prevents stray taps when the phone is left on the table. Unlock with a 1-second long-press.

**Amount keypad.** A custom numeric keypad in a bottom sheet, not the OS keyboard. It has a `00` key and shows Indian grouping live (₹1,00,000).

### 8.5 Repay short
- Toggle **Cash / Chips**. Default amount = full outstanding. Quick buttons: full, half, custom.
- Copy under the toggle:
  - Cash: "Rohit gives the bank ₹200 cash."
  - Chips: "Rohit hands back ₹200 in chips."

### 8.6 Leave table (settle on the spot)
1. Enter the chip count (keypad or chip counter).
2. The app shows the result in big type:
   - "Bank pays Sana **₹900**", or
   - "Rohit pays bank **₹150**". This happens when the outstanding short exceeds the chips.
   - It also shows their P&L for this stint.
3. Default action: **Settled ✓**. Secondary: "Settle part now". This enters the amount actually handed over; the rest moves to end-of-night settlement and the screen says so.
4. If `bankOwes > bankCash`, the warning from §5.5 shows and partial settlement is preselected.
5. **Blocked cases:**
   - The bank holder can't leave until they hand over the bank (§8.8). Show a button that goes straight there.
   - The host can't leave until they hand over hosting, unless they're ending the night.
6. If only one player would be left at the table, ask whether to end the game instead.

### 8.7 Live view link (anti-cheat by transparency)
- Every night has a `view_token` (128-bit random, base62). The host shares it by QR or WhatsApp.
- `/v/[token]`:
  - Anonymous Supabase sign-in happens under the hood, then `redeem_view_token` adds the viewer to `session_viewers`.
  - Viewers get realtime updates of the table, the full log (including voided entries with reasons) and the final settlement.
- Viewer header: "Viewing · hosted by Amit · last update 9:42 PM". If the host is offline: "Host is offline — 3 min since last update".
- Viewers can tap **"This is me"** to claim their member profile (requires login). The night then appears in their history.
- The host can rotate or revoke the link. Links stop working 48 h after the night closes; group members keep access through the group.
- Viewer pages are `noindex` and send no referrer.

### 8.8 Host and bank handover
**Hand over host** (current host, online):
1. Pick the new host from the logged-in members at this night, or show a **handover QR** that the new host scans while logged in.
2. Precondition: the outbox is empty (all events synced). If not, show "Syncing 3 entries…" and wait. If offline, block with a clear message.
3. RPC `transfer_host` runs in one transaction. It:
   - sets `host_user_id`,
   - increments `host_epoch`,
   - inserts `HOST_TRANSFERRED`.
4. The old device becomes a viewer. The new device opens the Live Table with full history.

**Hand over bank** (also part of "Leave" for the bank holder):
1. Show the expected cash: "Bank should hold ₹2,800." The outgoing holder counts and enters the actual amount.
2. Record `BANK_TRANSFERRED` with `counted` and `expected`. A mismatch is shown in red in the log and on the settlement screen. It is not blocking.

**Combined flow.** "I'm leaving and I'm the host + bank" runs as one wizard:
1. Count your chips.
2. Settle your stint.
3. Count the bank cash.
4. Pick the new bank holder.
5. Pick the new host.
6. Done.

**Force takeover.** For when the host's phone dies.
- A group admin opens the night and taps "Take over hosting".
- Allowed only if the host has been silent for ≥ 10 minutes (`host_last_seen_at`; the host heartbeats every 60 s while online). The old host can also approve instantly from any of their logged-in devices.
- Logged as `HOST_TRANSFERRED{forced:true}`, shown to all viewers.
- The old device's unsynced events are rejected by `host_epoch`. When that device comes back online, show "You're no longer the host. These 2 entries weren't saved:" with the details, so the new host can re-enter them.

### 8.9 End game, final count and reconciliation
1. `End game` asks for confirmation, then emits `COUNTING_STARTED`. Live actions are locked, with a "Back to game" escape that emits `COUNTING_REOPENED`.
2. **Count screen.** All active players in a list. Each row has:
   - a big amount field (tap opens the keypad), and
   - an optional **chip counter** (steppers per chip color, e.g. Red ₹10 × 12, Blue ₹50 × 4…), which totals automatically.
3. **Sticky footer** shows the live reconciliation as counts come in:
   - "Counted ₹2,600 of ₹3,100 · 2 players left to count"
   - When all are counted, it shows one of:
     - ✅ "Everything matches — ₹3,100"
     - 🔴 "₹100 missing from the table"
     - 🟠 "₹200 extra on the table"
4. **Gap resolution sheet** (when gap ≠ 0):
   - **Recount.** Jumps back to the counts.
   - **Check the log.** Opens the log filtered to shorts, repays, leaves and top-ups, with "likely causes" text based on the sign of the gap (§5.4).
   - **Accept and adjust.** Three choices (§5.4) with a preview of each player's adjusted amount. Confirming emits the `ADJUSTMENT` events.
5. When the gap is 0, the **Settle** button lights up.

### 8.10 Settlement reveal and close
1. **Reveal** (≤ 3.5 s, tap to skip; §11.5):
   - The screen dims, then diyas light up.
   - Players' results count up from 0 in rank order.
   - Spark burst on the top winner.
2. **Results list**, ranked by P&L:
   - Signed and colored (+₹500 / −₹700); never color alone.
   - Each row expands to show stints, shorts taken and repaid, and adjustments ⚠.
3. **Titles** (light, never mocking):
   - 👑 Raja of the night (top winner)
   - 🪔 Comeback (took a short, finished positive)
   - 🎯 Steady (closest to ₹0)
   - 🧾 Short king (most shorts by count, only if ≥ 2)
4. **Who pays whom.** Segmented control: **Fewest payments** (default) / **Via bank**.
   - Each row: `Amit → Rohit ₹1,100` with a **Paid** checkbox (`TRANSFER_MARKED`; record only).
   - A progress line: "2 of 4 settled".
5. **Share:**
   - **WhatsApp text** via the Web Share API, falling back to `https://wa.me/?text=`. Format below.
   - **Image card**: a PNG rendered client-side with `html-to-image`. Works offline; shared via the Web Share API with files.
6. **Close night.** Emits `SESSION_CLOSED`. Closing triggers server-side verification and the stats write (§9.4). It is allowed even if not every transfer is ticked (unticked ones stay visible in history). Reopening needs a reason and is logged.

WhatsApp text format:
```
🪔 Hisaab · Diwali Night · 8 Nov
Buy-in ₹500 · 5 players · 4h 12m

Results
Rohit +₹400
Sana +₹500
Kunal ₹0
Amit −₹200
Priya −₹700

Who pays whom
Amit → Rohit ₹1,100
Amit → Kunal ₹1,000
Amit → Sana ₹400
Priya → Sana ₹200

Full log: <view link>
```

### 8.11 Kitty (optional, off by default)
- A fixed per-player contribution for food or the host, e.g. ₹100. It's paid in cash to a chosen kitty holder and is **outside the chip math**.
- When on, setup shows a checklist "Kitty: 4 of 6 paid" (`KITTY_MARKED`).
- The settlement and share text show one line: "Kitty ₹600 with Amit".

### 8.12 Bank check (any time)
- Tapping the Bank stat opens: "Bank should hold ₹2,800. Count it?"
- The host enters the counted amount, which records `BANK_CHECK`. A match gives a green tick. A mismatch shows a red note in the log with the difference.
- Non-blocking. Builds trust when the bank holder isn't the host.

### 8.13 Log
- Reverse-chronological. Each line reads like a sentence: "9:42 PM · Rohit took a short · ₹300 · by Amit".
- Voided lines are struck through with the reason. Adjustments, bank checks and host changes get distinct icons.
- Filter chips: All · Shorts · Top-ups · Leaves · Fixes. Per-player filter from a player card.
- Export the log as CSV from the night's menu.

### 8.14 History and stats
- **Night detail.** Results, settlement, full log replay, and duration / players / total chips issued / shorts count.
- **Group leaderboard.**
  - Columns: net total, nights played, nights won (P&L > 0), biggest single-night win, current winning streak.
  - Ranges: All time / This year / **Festive season** / Custom range.
  - The festive season is a date range the group sets once, e.g. Dhanteras to Bhai Dooj.
- **Personal stats** (claimed members, across all groups):
  - Running net line chart.
  - Nights played, win rate, best and worst night.
  - Charts are simple line or bar.
- Stats come from `session_results` rows written when a night is verified and closed (§9.4). Voided or reopened nights recompute their rows.

### 8.15 Profile and settings
- Display name, avatar color.
- Language: English / Hinglish.
- Motion: Full / Reduced. Defaults to the OS setting.
- Sounds: off by default.
- Haptics: on by default.
- Export my data (JSON).
- Delete account. This removes the profile and unlinks claimed members; group history keeps the nickname.

---

## 9. Architecture

### 9.1 Stack
- **Next.js** (latest stable, App Router, TypeScript strict, React Server Components for landing and history; client components for the live game). Deployed on **Vercel**.
- **Tailwind CSS v4**, with design tokens as CSS variables (§11).
- **Supabase**:
  - Postgres with Row Level Security
  - Auth (Google, email OTP, anonymous)
  - Realtime (`postgres_changes` on `events`)
  - Edge Function `verify-and-close`
- **Local-first:**
  - **Dexie** (IndexedDB) with `dexie-react-hooks` `useLiveQuery`.
  - **Zustand** for UI state only.
  - **TanStack Query** for server-only data (groups, history, stats).
- **PWA:** **Serwist** (`@serwist/next`) service worker, plus a web app manifest.
- **Motion:**
  - **Motion** (`motion/react`, formerly Framer Motion) for UI transitions, sheets and number rolls.
  - **GSAP** for the settlement reveal timeline.
  - **Three.js via React Three Fiber + drei**, only for the splash and the settlement reveal. Lazy-loaded.
- **i18n:** `next-intl`, locales `en` and `hi-Latn` (Hinglish).
- **Validation:** `zod` schemas per event type, shared by client and Edge Function.
- **Other:** `html-to-image` (share card), `qrcode.react`, `uuid` (v7).
- **Quality:** Vitest + fast-check (ledger), Playwright (E2E), Lighthouse CI, ESLint + Prettier, Sentry (optional, behind env).

### 9.2 Repo layout
```
/apps/web                 Next.js app
/packages/ledger          pure TS: types, reducer, derive, reconcile, settle, validate, zod schemas
/packages/ui              tokens + primitives (Button, Sheet, Keypad, AmountText, PlayerCard…)
/supabase/migrations      SQL schema + RLS
/supabase/functions/verify-and-close   Deno edge fn importing packages/ledger (bundled)
/supabase/tests           RLS tests (pgTAP)
/e2e                      Playwright
```
Use pnpm workspaces. `packages/ledger` has no runtime dependencies besides zod.

### 9.3 Offline and sync

**Write path (host device only):**
```
tap → ledger.canApply(state, event) → Dexie.transaction(append event with next seq, outbox.add)
    → useLiveQuery re-projects → UI updates (< 50 ms)
    → syncWorker.flush() when: online event, visibilitychange, every 10 s, Background Sync (Chromium)
        → supabase.from('events').upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
        → mark synced; on 409 / epoch rejection → surface "no longer host" flow (§8.8)
```

**Read path (viewers, other devices, re-opening on a new device):**
1. Fetch the session and events, ordered by `seq`.
2. Cache them in Dexie.
3. Subscribe to Realtime inserts filtered by `session_id`.
4. On a `seq` gap, refetch the missing range. On reconnect, fetch `seq > lastSeq`.

**Other rules:**
- **Service worker.** Precache the app shell and fonts. NetworkFirst for navigations, with an offline fallback to the cached shell. CacheFirst for static assets. After the first visit, the full app (including `/app/new` and the Live Table) must work in airplane mode.
- **Storage.** Call `navigator.storage.persist()` when the first night starts.
- **Auth offline.** The Supabase session persists locally. Expired tokens don't block local writes; the outbox waits for refresh. If refresh fails, prompt sign-in and keep the outbox.
- **Conflicts.**
  - Events: single writer per `host_epoch`, append-only, so there are no merge conflicts.
  - Group and member metadata: last-write-wins on `updated_at`.
- **Sync UI.** The sync pill is always visible on host screens. A night can't be closed while the outbox is non-empty and the device is online; offline closing is allowed and syncs later.

### 9.4 Server verification
`verify-and-close` (Edge Function, called on `SESSION_CLOSED` sync):
1. Loads all events for the session.
2. Replays them with the same `packages/ledger` code.
3. Asserts gap = 0 and Σ P&L = 0.
4. Writes `session_results` and marks `sessions.verified_at`.

On failure: mark the night `needs_review`, and show the host what failed. Stats only use verified nights.

### 9.5 Data model (Supabase / Postgres)

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_color text not null default 'marigold',
  locale text not null default 'en',
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key,
  name text not null,
  emoji text default '🪔',
  owner_id uuid not null references profiles(id),
  default_buy_in int not null default 500 check (default_buy_in > 0),
  chip_set jsonb,                 -- [{label:'Red', color:'#E5484D', value:10}, …] or null
  festive_season jsonb,           -- {start:'2026-11-06', end:'2026-11-11'} or null
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table group_members (
  id uuid primary key,
  group_id uuid not null references groups(id) on delete cascade,
  nickname text not null,
  color text not null,
  user_id uuid references profiles(id) on delete set null,
  role text not null default 'member' check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, nickname),
  unique (group_id, user_id)
);

create table group_invites (
  token text primary key,
  group_id uuid not null references groups(id) on delete cascade,
  created_by uuid not null references profiles(id),
  expires_at timestamptz not null,
  max_uses int default 50, uses int not null default 0
);

create table sessions (
  id uuid primary key,
  group_id uuid not null references groups(id) on delete cascade,
  title text not null,
  status text not null default 'live' check (status in ('live','counting','settling','closed','needs_review')),
  host_user_id uuid not null references profiles(id),
  host_epoch int not null default 1,
  host_last_seen_at timestamptz,
  bank_holder_member_id uuid references group_members(id),
  config jsonb not null,          -- {buyIn, topUp, chipSet, kitty}
  view_token text unique not null,
  view_token_revoked_at timestamptz,
  started_at timestamptz not null,
  closed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  seq int not null,
  host_epoch int not null,
  type text not null,
  payload jsonb not null,
  actor_user_id uuid not null references profiles(id),
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  unique (session_id, seq)
);
-- Immutable: trigger raises on UPDATE/DELETE of events.

create table session_viewers (
  session_id uuid references sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table session_results (
  session_id uuid references sessions(id) on delete cascade,
  member_id uuid references group_members(id) on delete cascade,
  pnl int not null, cash_in int not null, shorts_taken int not null, shorts_count int not null,
  stints int not null, adjusted boolean not null default false, titles text[] not null default '{}',
  primary key (session_id, member_id)
);
```

**RLS summary**

| Table | Select | Insert / Update |
|---|---|---|
| profiles | self; display_name of people sharing a group | self |
| groups, group_members | members of the group | owner/admin (members: insert self via invite RPC) |
| sessions | group members; `session_viewers` | insert: group members; host fields only via RPC |
| events | group members; `session_viewers` | insert only if `auth.uid() = sessions.host_user_id`, `host_epoch` matches, status ≠ closed (except `SESSION_REOPENED`). No update/delete. |
| session_results | group members | service role (edge fn) only |

**RPCs** (security definer, rate-limited):
- `redeem_view_token(token)`
- `transfer_host(session_id, to_user_id)`
- `force_takeover(session_id)`
- `heartbeat(session_id)`
- `join_group(invite_token, member_id?)`
- `rotate_view_token(session_id)`

---

## 10. Edge cases (each needs a test)

| Case | Behavior |
|---|---|
| Same nickname twice | Blocked in group; suggest "Rohit K" |
| Repay more than outstanding | Blocked by ledger validation, message shows the max |
| Leaver's short exceeds chips | `bankOwes` negative → "Rohit pays bank ₹150"; can defer |
| Bank can't cover a leaver | Warning + partial settle preselected; remainder joins final settlement |
| Bank holder wants to leave | Must hand over bank first (wizard) |
| Host wants to leave mid-game | Must hand over host first (needs online) or end the night |
| Host phone dies | Admin force-takeover after 10 min silence; stale-epoch events rejected and surfaced |
| Player rejoins | New stint, new buy-in; night P&L sums stints |
| Last player standing | Prompt to end the game |
| Accidental tap | 6 s undo; table lock |
| Huge typo (₹50000 vs ₹500) | > 5× buy-in confirm |
| Counting with phones out of sync | Ordering is by `seq`, never by device clock |
| Night spans midnight | Night date = `started_at` local date |
| 0 chips at the end | Valid; shows full loss |
| Viewer opens link before first sync | "This night hasn't synced yet. It'll appear when the host is online." |
| Reopen after close | Requires reason; stats recompute after re-close |
| Very long night (500+ events) | Incremental projection; log virtualized |

---

## 11. Design system — "Diya Night"

### 11.1 Direction

A dark, warm, quiet room lit by diyas. The interface itself stays calm and precise, like a ledger. The festive light shows up at the edges: a flame-colored primary action, gold hairlines, rangoli line patterns in empty states, and two big "light up" moments (splash and settlement reveal).

References pulled from Refero Styles (open each style page and copy its DESIGN.md for the full token set):

| Reference | What to take | Link |
|---|---|---|
| **Atoms** — "obsidian monolith in candlelight" | Black canvas, warm cream text instead of white (#fff7dd), one champagne-gold accent (#c8ad86) for hairlines and tags, no shadows, borders define surfaces | https://styles.refero.design/style/4433dfe7-315a-4459-bfd7-f59ccdc09bad |
| **Raycast** — "midnight command center, coral neon" | Near-black tonal steps for surfaces; the "keyboard key" inset-shadow stack that makes cards feel pressable; 98% achromatic with one warm accent; Geist-Mono style uppercase micro-labels | https://styles.refero.design/style/3b6a17f0-3bdf-418c-a95e-0b89e5a8b2f8 |
| **Dala** — "constellation floating on black velvet" | A particle field as the brand gesture (becomes diya sparks in our splash); saffron (#ffb829) used as the spark accent; one filled CTA per view | https://styles.refero.design/style/e5f5f8cf-e68d-4ed1-bbf5-6b67569af648 |
| **Superhuman** — "golden hour editorial" | Restraint: tabular numerals for data, light-weight large type, no drop shadows on cards | https://styles.refero.design/style/418b374a-be64-44f0-b17e-1d45308c7e62 |

### 11.2 Color tokens

```css
:root {
  /* surfaces — warm near-black, tonal steps (Raycast) */
  --bg:          #0A0705;   /* canvas */
  --surface-1:   #120D09;   /* cards */
  --surface-2:   #1A130E;   /* sheets, raised */
  --surface-well:#070504;   /* inputs, keypad wells (recessed) */

  /* text — candlelight cream, never pure white (Atoms) */
  --text:        #FFF7DD;
  --text-2:      #B8AE97;
  --text-3:      #7A7262;

  /* lines */
  --hairline:        rgb(255 247 221 / 0.10);
  --hairline-strong: rgb(255 247 221 / 0.18);
  --gold:            #C8AD86;  /* accent hairlines, tags, section eyebrows */

  /* the one action color — diya flame */
  --flame:       #FFB829;   /* primary button fill, focus ring, active tab */
  --on-flame:    #1A0F00;   /* text on flame */
  --ember:       #FF7A1A;   /* only in flame gradients: splash, reveal, logo */

  /* semantic — always paired with a sign or icon */
  --win:         #7BD8A6;
  --loss:        #FF6B5B;
  --short:       #F0679A;   /* rani pink: shorts / money owed to bank */
  --warn:        #FFB829;
}
```

Rules:
- **One filled chromatic button per screen**, and it's flame. Everything else is ghost, outline (hairline) or surface-2.
- Gold is for lines, eyebrows and tags. Never a fill.
- Ember appears only inside gradients (`linear-gradient(180deg, #FFB829, #FF7A1A)`) on the splash, the reveal and the logo diya.
- Pure white (#FFF) and pure black (#000) are banned.
- Contrast: body text on `--bg` ≥ 7:1, secondary ≥ 4.5:1. Verify in CI with an axe check.

### 11.3 Typography
- **UI and numbers:** Inter (via `next/font`), with `font-feature-settings: "tnum", "cv11"`. All amounts use tabular figures so columns align and rolling digits don't jitter.
- **Display moments** (landing hero, reveal headline, big result numbers): Instrument Serif, regular weight, tight tracking (−0.02em). This gives a festive, slightly classical voice without being kitsch.
- **Micro-labels / eyebrows:** JetBrains Mono, 11px, uppercase, +0.08em tracking, `--gold`.

Type scale (px):

| Role | Size / weight |
|---|---|
| caption | 12 |
| body | 15 |
| body-strong | 15 / 600 |
| label | 13 / 500 |
| title | 20 / 600 |
| amount-lg | 28 / 600 tnum |
| display | 44 Instrument Serif |
| hero | 64 Instrument Serif (landing only) |

### 11.4 Shape, depth, spacing
- Radius: cards 16, sheets 24 (top corners), buttons 12, pills/badges 999.
- Spacing on a 4px base. Screen gutter 16. Card padding 16. Min tap target 48×48.
- **Depth = key treatment, not drop shadows:**
  ```css
  --key: inset 0 1px 0 rgb(255 247 221 / .06), 0 0 0 1px rgb(255 247 221 / .10), inset 0 -1px 0 rgb(0 0 0 / .35);
  --key-pressed: inset 0 2px 4px rgb(0 0 0 / .5), 0 0 0 1px rgb(255 247 221 / .08);
  --glow-flame: 0 0 24px rgb(255 184 41 / .28);  /* primary button only */
  ```
- Texture: an SVG rangoli line pattern (kolam-style dots and loops, 1px `--gold` at 5% opacity). Used on empty states, the settlement share card and the landing. Never behind numbers.
- Iconography: Lucide, 1.5px stroke, 20px. Custom diya mark for the logo and favicon (two-tone flame gradient).

### 11.5 Motion
- **Principle:** UI motion is fast and functional. Festive motion is reserved for two moments.
- **UI (Motion):**
  - Sheets: spring (stiffness 420, damping 34).
  - List insert/remove: `layout` animations at 180 ms.
  - Number change: per-digit roll at 280 ms.
  - Press: scale 0.97 + `--key-pressed`.
  - Toast: slide up 160 ms.
- **Reveal (GSAP timeline, ≤ 3.5 s, skippable by tap):**
  1. Background dims.
  2. Diya row lights left to right (0.8 s).
  3. Results count up with 80 ms stagger.
  4. Top-winner card gets a flame-edge glow.
  5. Transfers slide in.
- **Three.js (React Three Fiber), only two places:**
  - **Splash** (≤ 1.6 s, once per day, skippable): a single diya flame shader (noise-displaced, ember→flame gradient) with ~600 drifting spark particles on a dark bokeh field.
  - **Settlement reveal:** one phuljhadi/firework spark burst over the winner (~1,500 particles, 1.2 s).
  - Budgets:
    - The 3D chunk is lazy-loaded and never on the Live Table route.
    - DPR is capped at 1.5.
    - Pause on `visibilitychange`; dispose geometries and materials on unmount.
  - **Fallback:** a CSS/Canvas2D version with identical timing when any of these hold:
    - `prefers-reduced-motion`
    - Motion setting = Reduced
    - `navigator.deviceMemory ≤ 2`
    - `hardwareConcurrency ≤ 4`
    - Save-Data is on
- Sounds (optional, off by default): soft chip clink on confirm, bell on settlement. Under 30 KB total.

### 11.6 Microcopy
Short, warm, plain. Hinglish locale examples:

| Key | English | Hinglish |
|---|---|---|
| short.cta | Short | Short |
| short.done | Rohit took a short · ₹300 | Rohit ne short liya · ₹300 |
| repay.done | Rohit paid back ₹200 | Rohit ne ₹200 lauta diye |
| gap.missing | ₹100 missing from the table | Table se ₹100 gayab hain |
| gap.extra | ₹200 extra on the table | Table pe ₹200 zyada hain |
| match | Everything matches | Hisaab barabar ✅ |
| settle.title | Who pays whom | Kisko kitna dena hai |
| empty.table | Table's empty. Add your crew. | Table khaali hai. Sabko bulao. |

Amounts are always formatted with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` → ₹1,00,000.

---

## 12. Performance and accessibility budgets
- The Live Table route's JS is < 170 KB gzipped (no Three.js, no GSAP on that route).
- LCP < 2.0 s and INP < 100 ms on a Moto G-class phone on 4G (Lighthouse mobile).
- Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, PWA installable.
- Every action's UI update < 50 ms (local write, no network wait).
- Battery: no animation loops running on the Live Table while idle.
- Screen reader labels read amounts in full ("Rohit, in 800 rupees, short 100 rupees"). Focus order follows visual order. Sheets trap focus. Every color meaning also has a sign or icon.

---

## 13. Positioning, legal and privacy

- **Positioning:** a **game night tracker / scorekeeper** for friends. In product copy, use "game night", "score", "tracker", "hisaab". Don't use "bet", "gamble", "wager" or "casino". No in-app payments, no payment links, no ads.
- **Distribution:** PWA only, no app stores.
- **Terms of Service** must state that the app:
  - doesn't host or run any game,
  - doesn't move or hold money,
  - is a record-keeping tool for people who know each other,
  - is for users 18+ only,
  - leaves users responsible for following local laws.
- **Privacy** (India DPDP Act basics):
  - Collect the minimum (name, email, nicknames, game records).
  - Privacy policy page.
  - Data export and account deletion in-app.
  - No selling or sharing data.
  - Analytics without personal data.
- **Analytics:** Vercel Analytics plus custom events with **no names or amounts**: `night_started{players}`, `event_recorded{type}`, `gap_found{sign}`, `night_closed{duration_bucket}`, `pwa_installed`.
- Have a lawyer review the ToS and privacy policy before public launch. This document is not legal advice.

---

## 14. Testing strategy

### 14.1 Ledger (must pass before UI work)
- **Golden test:** §5.6 exactly. Bank and table totals after each step, per-stint values, positions, the transfer list in order, and the ₹100-missing variant.
- **Property tests (fast-check, 10k runs each)** over random valid nights (2–12 players, rejoins, cash/chip repays, partial on-the-spot settlements, random gaps fixed by adjustments):
  1. Chip conservation: with true counts, gap = 0.
  2. After reconciliation, Σ pnl = 0.
  3. Σ positions = 0. Applying transfers clears every balance.
  4. Transfers ≤ (non-zero positions − 1). Every amount > 0.
  5. For every person, cash paid in − cash received (on the spot + final transfers), counting the bank holder's held cash = −P&L.
  6. Voiding event *e* gives the same state as a log without *e*.
  7. Replay is deterministic: same events → identical output.
- Validation tests for every rule in §5.7.

### 14.2 Sync and data
- Dexie outbox: offline appends, then online flush; duplicate upsert is idempotent; out-of-order Realtime delivery; seq-gap refetch.
- Stale `host_epoch` insert is rejected; the "no longer host" UI appears.
- RLS (pgTAP):
  - viewer can't insert;
  - non-member can't select;
  - events can't be updated or deleted;
  - revoked token can't be redeemed.

### 14.3 E2E (Playwright, Pixel 7 and iPhone 14 viewports)
1. Full night: setup 5 players, then the §5.6 sequence, then count, settle, share text matches the snapshot, close.
2. Airplane mode (`context.setOffline(true)`) from setup to settlement, then back online: everything syncs and the viewer sees the final state.
3. Viewer in a second context sees each event within 2 s while online.
4. Host handover between two logged-in contexts; the old host becomes a viewer.
5. Force takeover with the old device offline holding unsynced events, then the rejected-events notice.
6. Gap flow: miscount → missing message → "split equally" → settlement shows ⚠.
7. Leave with partial settlement → deferred amount appears in final settlement.
8. Undo within 6 s; fix via log after.
9. Reduced motion: no WebGL canvas is created.

### 14.4 Other
- Visual regression snapshots for: Live Table, count, settlement, viewer, empty states (dark only).
- Lighthouse CI on `/`, `/app`, `/app/s/[id]` with the budgets in §12.
- axe accessibility checks in E2E.

---

## 15. Acceptance criteria (v1 done when…)

- [ ] A 6-player night can be set up in < 60 s and played entirely offline.
- [ ] Top-up ≤ 2 taps, short ≤ 3 taps, repay ≤ 3 taps from the Live Table.
- [ ] Every action has a 6 s undo; every correction is visible in the log with a reason.
- [ ] Viewers see live updates without logging in; the log shows voided entries.
- [ ] Leave settles on the spot by default, supports partial settlement, and rejoin works.
- [ ] Host and bank can be handed over; force takeover works; stale writes are rejected and surfaced.
- [ ] The count screen shows a live gap; settlement is blocked until it's 0 or adjusted.
- [ ] Settlement shows both views; the golden example produces exactly the 4 transfers in §5.6.
- [ ] WhatsApp text and image share work, including offline image generation.
- [ ] Closed nights are server-verified and feed group and personal stats.
- [ ] Login (Google + email OTP), groups, invites and member claiming work.
- [ ] English + Hinglish switch works on every screen.
- [ ] 3D only appears on the splash and the reveal, with working fallbacks.
- [ ] All tests in §14 pass in CI; Lighthouse budgets met.
- [ ] Terms, privacy, 18+ confirmation, data export and account deletion are live.

---

## 16. Build order (all in v1)

| Milestone | Scope | Exit check |
|---|---|---|
| **M0 Foundation** | Monorepo, tokens/fonts, `packages/ledger` + zod schemas + golden & property tests, CI | Ledger tests green |
| **M1 Local night** | Dexie, wizard, Live Table, all actions, undo/void/fix, leave/rejoin, bank check, count + gap resolution, settlement (both views), share text, table lock, keypad. No login — local only | A full night works in airplane mode on a real phone |
| **M2 Accounts & sync** | Supabase schema + RLS, auth, groups, members, invites, outbox sync, Realtime, viewer link | Viewer on a second phone sees live updates |
| **M3 Trust features** | Host/bank handover, force takeover, epochs, heartbeats, deferred leaves, verify-and-close function | E2E 4, 5, 7 green |
| **M4 History & stats** | Night detail, group leaderboard + festive season, personal stats, claiming, CSV export | Stats match verified results |
| **M5 Look & feel** | Splash (R3F), settlement reveal (GSAP + R3F), landing page, share image card, Hinglish, sounds, install prompts | Budgets in §12 still met |
| **M6 Launch** | Legal pages, analytics, a11y pass, Lighthouse CI, Sentry, production Supabase + Vercel env | §15 checklist complete |

M1 alone is a usable product on a single phone. If time gets tight before a game night, ship M1 to a Vercel preview and use it.

---

## 17. Open items (decide during build; defaults in bold)

1. Final product name: **Hisaab** (alternatives: Chaal, Pattabook).
2. Chip counter on by default for new groups: **off** (enter totals).
3. Max players per night: **12**.
4. View link lifetime after close: **48 h**.
5. Phone OTP at launch: **off** until an SMS provider is chosen.
