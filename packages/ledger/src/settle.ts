import { derive, minimizeTransfers, reconcile, settlementPositions, type Transfer } from './core';
import type { Resolution } from './events';
import { activeStints, activeStintOfMember, type NightState } from './project';

const collator = new Intl.Collator('en-IN');

export interface CountStatus {
  expected: number;
  counted: number;
  gap: number;
  uncounted: number;
  complete: boolean;
}

/** Live reconciliation while counts come in (§8.9). */
export function countStatus(state: NightState): CountStatus {
  const r = reconcile(state.stints);
  const uncounted = activeStints(state).filter((s) => s.final === null).length;
  return { ...r, uncounted, complete: uncounted === 0 };
}

/**
 * ADJUSTMENT amounts that sum to −gap (§5.4).
 * split_equal: remainder ₹1 at a time in seat order.
 */
export function planAdjustment(
  state: NightState,
  resolution: Resolution,
  assignedStintId?: string,
): { stintId: string; amount: number }[] {
  const { gap } = reconcile(state.stints);
  if (gap === 0) return [];
  const total = -gap;
  if (resolution === 'bank_absorbs') {
    const s = activeStintOfMember(state, state.bankHolderMemberId ?? '');
    if (!s) throw new Error('Bank holder is not at the table');
    return [{ stintId: s.id, amount: total }];
  }
  if (resolution === 'assigned') {
    if (!assignedStintId) throw new Error('Pick a player');
    return [{ stintId: assignedStintId, amount: total }];
  }
  const players = activeStints(state).sort((a, b) => a.seat - b.seat);
  const sign = Math.sign(total);
  const abs = Math.abs(total);
  const base = Math.floor(abs / players.length);
  const rem = abs % players.length;
  return players
    .map((s, i) => ({ stintId: s.id, amount: sign * (base + (i < rem ? 1 : 0)) }))
    .filter((a) => a.amount !== 0);
}

export interface Settlement {
  positions: Record<string, number>;
  /** Fewest payments (default view). */
  transfers: Transfer[];
  /** Each person settles with the bank holder only. + bank pays them, − they pay bank. */
  viaBank: { memberId: string; amount: number }[];
  bankHolderMemberId: string;
}

/** Requires isSettleable(state). */
export function settlement(state: NightState, nameOf: (memberId: string) => string): Settlement {
  const bankHolder = state.bankHolderMemberId!;
  const positions = settlementPositions(state.stints, bankHolder);
  const transfers = minimizeTransfers(positions, nameOf);
  const viaBank = Object.entries(positions)
    .filter(([id, v]) => id !== bankHolder && v !== 0)
    .map(([memberId, amount]) => ({ memberId, amount }))
    .sort((a, b) => collator.compare(nameOf(a.memberId), nameOf(b.memberId)));
  return { positions, transfers, viaBank, bankHolderMemberId: bankHolder };
}

export type Title = 'raja' | 'comeback' | 'steady' | 'short_king';

export interface MemberResult {
  memberId: string;
  pnl: number;
  cashIn: number;
  shortsTaken: number;
  shortsCount: number;
  stints: number;
  adjusted: boolean;
  titles: Title[];
}

/** Per-person night results, ranked by P&L (desc, then name). Requires every stint to be counted. */
export function nightResults(state: NightState, nameOf: (memberId: string) => string): MemberResult[] {
  const by = new Map<string, MemberResult>();
  for (const s of state.stints) {
    const d = derive(s);
    const r =
      by.get(s.memberId) ??
      ({
        memberId: s.memberId,
        pnl: 0,
        cashIn: 0,
        shortsTaken: 0,
        shortsCount: 0,
        stints: 0,
        adjusted: false,
        titles: [],
      } satisfies MemberResult);
    r.pnl += d.pnl ?? 0;
    r.cashIn += d.cashIn;
    r.shortsTaken += s.shortsTaken;
    r.shortsCount += s.shortsCount;
    r.stints += 1;
    r.adjusted ||= s.adj !== 0;
    by.set(s.memberId, r);
  }
  const byName = (a: MemberResult, b: MemberResult) => collator.compare(nameOf(a.memberId), nameOf(b.memberId));
  const results = [...by.values()].sort((a, b) => b.pnl - a.pnl || byName(a, b));
  if (!results.length) return results;

  const top = results[0]!;
  if (top.pnl > 0) top.titles.push('raja');
  for (const r of results) if (r.shortsCount > 0 && r.pnl > 0) r.titles.push('comeback');
  const steady = [...results].sort((a, b) => Math.abs(a.pnl) - Math.abs(b.pnl) || byName(a, b))[0]!;
  steady.titles.push('steady');
  const king = [...results].sort((a, b) => b.shortsCount - a.shortsCount || byName(a, b))[0]!;
  if (king.shortsCount >= 2) king.titles.push('short_king');
  return results;
}
