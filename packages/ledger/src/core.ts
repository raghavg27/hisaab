// Port of the PRD §5.7 reference implementation. Integers only (whole rupees).
export type Method = 'cash' | 'chips';

export interface Stint {
  id: string;
  memberId: string;
  buyIns: number;
  topUps: number;
  shortsTaken: number;
  repaidCash: number;
  repaidChips: number;
  final: number | null;
  adj: number;
  left: boolean;
  settledNow: number;
}

export interface Derived {
  chipsIssued: number;
  netChips: number;
  cashIn: number;
  shortOutstanding: number;
  bankOwes: number | null;
  pnl: number | null;
  deferred: number;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export function derive(s: Stint): Derived {
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
  let bankCash = 0,
    chipsOnTable = 0,
    shortsOut = 0;
  for (const s of stints) {
    const d = derive(s);
    bankCash += d.cashIn;
    chipsOnTable += d.netChips;
    if (s.left) {
      bankCash -= s.settledNow;
      chipsOnTable -= s.final!;
    } else shortsOut += d.shortOutstanding;
  }
  return { bankCash, chipsOnTable, shortsOut };
}

export function reconcile(stints: Stint[]) {
  const { chipsOnTable } = tableTotals(stints);
  const counted = stints.filter((s) => !s.left).reduce((a, s) => a + (s.final ?? 0) + s.adj, 0);
  return { expected: chipsOnTable, counted, gap: counted - chipsOnTable };
}

const collator = new Intl.Collator('en-IN');

/**
 * positions: + receives, − pays. Must sum to 0. Deterministic.
 * Ties are broken by display name (`nameOf`), so output order doesn't depend on ids.
 */
export function minimizeTransfers(
  positions: Record<string, number>,
  nameOf: (id: string) => string = (id) => id,
): Transfer[] {
  const total = Object.values(positions).reduce((a, b) => a + b, 0);
  if (total !== 0) throw new Error(`positions sum to ${total}`);
  const byName = (a: { id: string }, b: { id: string }) => collator.compare(nameOf(a.id), nameOf(b.id));
  const cred = Object.entries(positions)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }))
    .sort(byName);
  const debt = Object.entries(positions)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }))
    .sort(byName);
  const out: Transfer[] = [];
  // Pass 1: exact matches remove a transfer each
  for (const d of debt) {
    const c = cred.find((c) => c.v > 0 && c.v === d.v);
    if (c && d.v > 0) {
      out.push({ from: d.id, to: c.id, amount: d.v });
      c.v = 0;
      d.v = 0;
    }
  }
  // Pass 2: greedy largest debtor → largest creditor; ties broken by name
  const byDesc = (a: { id: string; v: number }, b: { id: string; v: number }) => b.v - a.v || byName(a, b);
  for (;;) {
    const D = debt.filter((x) => x.v > 0).sort(byDesc);
    const C = cred.filter((x) => x.v > 0).sort(byDesc);
    if (!D.length || !C.length) break;
    const amount = Math.min(D[0]!.v, C[0]!.v);
    out.push({ from: D[0]!.id, to: C[0]!.id, amount });
    D[0]!.v -= amount;
    C[0]!.v -= amount;
  }
  return out;
}

/** One balance per person (memberId). + receives, − pays. Requires every active stint to be counted. */
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
