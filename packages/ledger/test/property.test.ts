import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  activeStintOfMember,
  activeStints,
  canApply,
  derive,
  firstInvalid,
  planAdjustment,
  project,
  reconcile,
  settlement,
  tableTotals,
  VOIDABLE,
  type LedgerEvent,
  type NightState,
  type Resolution,
} from '../src';
import { Night } from './helpers';

const RUNS = Number(process.env.PROP_RUNS ?? 10_000);
const nameOf = (id: string) => `P${id}`;

const nightArb = fc.record({
  players: fc.integer({ min: 2, max: 12 }),
  buyIn: fc.constantFrom(100, 200, 500, 1000),
  actions: fc.array(fc.tuple(fc.nat(9), fc.nat(1000), fc.nat(1000), fc.nat(1000)), { maxLength: 60 }),
  noise: fc.option(fc.tuple(fc.nat(11), fc.integer({ min: -2000, max: 2000 })), { nil: undefined }),
  resolution: fc.constantFrom<Resolution>('bank_absorbs', 'split_equal', 'assigned'),
  pick: fc.nat(1000),
});

type Spec = typeof nightArb extends fc.Arbitrary<infer T> ? T : never;

/**
 * Simulates a valid night: tracks every stint's true chips (including chips moving between
 * players during play), so a true count must reconcile.
 */
function simulate(spec: Spec) {
  const night = new Night();
  const chips = new Map<string, number>();
  const members = Array.from({ length: spec.players }, (_, i) => String(i).padStart(2, '0'));
  let stintN = 0;
  const join = (memberId: string) => {
    const stintId = `st${++stintN}`;
    night.add('PLAYER_JOINED', { stintId, memberId });
    night.add('BUY_IN', { stintId, amount: spec.buyIn });
    chips.set(stintId, spec.buyIn);
  };
  night.add('SESSION_STARTED', {
    title: 'Night',
    buyIn: spec.buyIn,
    topUp: spec.buyIn,
    bankHolderMemberId: members[0]!,
  });
  members.forEach(join);

  for (const [kind, a, b, c] of spec.actions) {
    const active = activeStints(night.state);
    const s = active[a % active.length]!;
    const out = derive(s).shortOutstanding;
    switch (kind) {
      case 0:
        night.add('TOP_UP', { stintId: s.id, amount: spec.buyIn });
        chips.set(s.id, chips.get(s.id)! + spec.buyIn);
        break;
      case 1: {
        const amount = 1 + (b % (3 * spec.buyIn));
        night.add('SHORT_TAKEN', { stintId: s.id, amount });
        chips.set(s.id, chips.get(s.id)! + amount);
        break;
      }
      case 2:
        if (out > 0) night.add('SHORT_REPAID', { stintId: s.id, amount: 1 + (b % out), method: 'cash' });
        break;
      case 3: {
        const max = Math.min(out, chips.get(s.id)!);
        if (max > 0) {
          const amount = 1 + (b % max);
          night.add('SHORT_REPAID', { stintId: s.id, amount, method: 'chips' });
          chips.set(s.id, chips.get(s.id)! - amount);
        }
        break;
      }
      case 4:
      case 8: {
        const t = active[b % active.length]!;
        const x = c % (chips.get(s.id)! + 1);
        chips.set(s.id, chips.get(s.id)! - x);
        chips.set(t.id, chips.get(t.id)! + x);
        break;
      }
      case 5: {
        if (s.memberId === night.state.bankHolderMemberId || active.length < 2) break;
        const finalChips = chips.get(s.id)!;
        const owes = finalChips - out;
        const { bankCash } = tableTotals(night.state.stints);
        let settledNow = b % 2 === 0 ? owes : Math.sign(owes) * (c % (Math.abs(owes) + 1));
        if (settledNow > bankCash) settledNow = Math.max(0, bankCash);
        night.add('PLAYER_LEFT', { stintId: s.id, finalChips, settledNow });
        chips.delete(s.id);
        break;
      }
      case 6: {
        const away = members.filter((m) => !activeStintOfMember(night.state, m));
        if (away.length) join(away[b % away.length]!);
        break;
      }
      case 7: {
        const to = active[b % active.length]!;
        if (to.memberId === night.state.bankHolderMemberId) break;
        const expected = tableTotals(night.state.stints).bankCash;
        night.add('BANK_TRANSFERRED', {
          fromMemberId: night.state.bankHolderMemberId!,
          toMemberId: to.memberId,
          counted: Math.max(0, expected),
          expected,
        });
        break;
      }
      case 9:
        break;
    }
  }
  return { night, chips };
}

function countAndReconcile(spec: Spec) {
  const { night, chips } = simulate(spec);
  const liveEvents = [...night.events];
  night.add('COUNTING_STARTED', {});
  const active = activeStints(night.state);
  for (const s of active) night.add('FINAL_COUNT', { stintId: s.id, finalChips: chips.get(s.id)! });
  const trueGap = reconcile(night.state.stints).gap;
  if (spec.noise) {
    const s = active[spec.noise[0] % active.length]!;
    night.add('FINAL_COUNT', { stintId: s.id, finalChips: Math.max(0, chips.get(s.id)! + spec.noise[1]) });
  }
  const assigned = active[spec.pick % active.length]!.id;
  for (const adj of planAdjustment(night.state, spec.resolution, assigned)) {
    night.add('ADJUSTMENT', {
      ...adj,
      resolution: spec.resolution,
      gapAtTime: reconcile(night.state.stints).gap,
    });
  }
  return { night, trueGap, liveEvents };
}

function totalPnl(state: NightState) {
  return state.stints.reduce((a, s) => a + derive(s).pnl!, 0);
}

describe('ledger properties (§14.1)', () => {
  it('1. chip conservation: true counts give gap 0', () => {
    fc.assert(
      fc.property(nightArb, (spec) => {
        expect(countAndReconcile(spec).trueGap).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('2. after reconciliation Σ pnl = 0 and the night can close', () => {
    fc.assert(
      fc.property(nightArb, (spec) => {
        const { night } = countAndReconcile(spec);
        expect(reconcile(night.state.stints).gap).toBe(0);
        expect(totalPnl(night.state)).toBe(0);
        night.add('SESSION_CLOSED', {});
      }),
      { numRuns: RUNS },
    );
  });

  it('3+4. positions sum to 0, transfers clear every balance, ≤ n−1 transfers, all > 0', () => {
    fc.assert(
      fc.property(nightArb, (spec) => {
        const { night } = countAndReconcile(spec);
        const st = settlement(night.state, nameOf);
        const sum = Object.values(st.positions).reduce((a, b) => a + b, 0);
        expect(sum).toBe(0);
        const bal = { ...st.positions };
        for (const t of st.transfers) {
          expect(t.amount).toBeGreaterThan(0);
          bal[t.from]! += t.amount;
          bal[t.to]! -= t.amount;
        }
        expect(Object.values(bal).every((v) => v === 0)).toBe(true);
        const nonZero = Object.values(st.positions).filter((v) => v !== 0).length;
        expect(st.transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
        // Via bank: the bank holder's balance is exactly the negative of everyone else's.
        const viaSum = st.viaBank.reduce((a, v) => a + v.amount, 0);
        expect(viaSum + st.positions[st.bankHolderMemberId]!).toBe(0);
      }),
      { numRuns: RUNS },
    );
  });

  it('5. per person: cash received − cash paid in (incl. held bank cash) = P&L', () => {
    fc.assert(
      fc.property(nightArb, (spec) => {
        const { night } = countAndReconcile(spec);
        const s = night.state;
        const st = settlement(s, nameOf);
        const { bankCash } = tableTotals(s.stints);
        const net: Record<string, number> = {};
        const pnl: Record<string, number> = {};
        for (const x of s.stints) {
          const d = derive(x);
          net[x.memberId] = (net[x.memberId] ?? 0) - d.cashIn + (x.left ? x.settledNow : 0);
          pnl[x.memberId] = (pnl[x.memberId] ?? 0) + d.pnl!;
        }
        for (const t of st.transfers) {
          net[t.from]! -= t.amount;
          net[t.to]! += t.amount;
        }
        net[st.bankHolderMemberId]! += bankCash;
        for (const id of Object.keys(pnl)) expect(net[id]).toBe(pnl[id]);
      }),
      { numRuns: RUNS },
    );
  });

  it('6. voiding event e gives the same state as a log without e', () => {
    fc.assert(
      fc.property(nightArb, fc.nat(1000), (spec, pick) => {
        const { night } = simulate(spec);
        const candidates = night.events.filter(
          (e) => VOIDABLE.includes(e.type) && e.type !== 'BUY_IN' && e.type !== 'PLAYER_JOINED',
        );
        if (!candidates.length) return;
        const target = candidates[pick % candidates.length]!;
        const without = night.events.filter((e) => e.id !== target.id);
        const v = night.make('EVENT_VOIDED', { targetId: target.id, reason: 'other' });
        const r = canApply(night.state, v);
        expect(r.ok).toBe(firstInvalid(without) === null);
        if (!r.ok) return;
        const voided = project([...night.events, v]);
        const removed = project(without);
        expect(voided.stints).toEqual(removed.stints);
        expect(voided.bankHolderMemberId).toBe(removed.bankHolderMemberId);
        expect(voided.status).toBe(removed.status);
        expect(tableTotals(voided.stints)).toEqual(tableTotals(removed.stints));
      }),
      { numRuns: RUNS },
    );
  });

  it('7. replay is deterministic and independent of arrival order', () => {
    fc.assert(
      fc.property(nightArb, fc.nat(), (spec, seed) => {
        const { night } = countAndReconcile(spec);
        const a = project(night.events);
        const shuffled = [...night.events].sort(
          (x, y) => ((x.seq * 2654435761 + seed) % 97) - ((y.seq * 2654435761 + seed) % 97),
        ) as LedgerEvent[];
        expect(project(shuffled)).toEqual(a);
        expect(project(night.events)).toEqual(a);
        expect(a).toEqual(night.state);
      }),
      { numRuns: Math.ceil(RUNS / 5) },
    );
  });
});

describe('generator coverage', () => {
  it('random nights include rejoins, both repay methods, partial settles, bank handovers and adjustments', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(nightArb, (spec) => {
        const { night } = countAndReconcile(spec);
        for (const e of night.events) {
          seen.add(e.type);
          if (e.type === 'SHORT_REPAID') seen.add(`repay_${e.payload.method}`);
          if (e.type === 'PLAYER_LEFT') {
            const s = night.state.stints.find((x) => x.id === e.payload.stintId)!;
            if (derive(s).deferred !== 0) seen.add('partial_settle');
            if (night.state.stints.filter((x) => x.memberId === s.memberId).length > 1) seen.add('rejoin');
          }
        }
      }),
      { numRuns: 2000 },
    );
    for (const k of ['repay_cash', 'repay_chips', 'partial_settle', 'rejoin', 'BANK_TRANSFERRED', 'ADJUSTMENT'])
      expect(seen.has(k), k).toBe(true);
  });
});
