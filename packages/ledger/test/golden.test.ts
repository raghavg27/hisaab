import { describe, expect, it } from 'vitest';
import {
  derive,
  nightResults,
  project,
  reconcile,
  settlement,
  stintOf,
  tableTotals,
  type LedgerEvent,
} from '../src';
import { Night } from './helpers';

// Ids deliberately don't sort like names, so tie-breaks must use names.
const M = { Amit: 'm9', Rohit: 'm2', Priya: 'm7', Kunal: 'm1', Sana: 'm5' } as const;
const names: Record<string, string> = Object.fromEntries(Object.entries(M).map(([n, id]) => [id, n]));
const nameOf = (id: string) => names[id]!;
type Name = keyof typeof M;

/** PRD §5.6. Returns the night after step 7 plus per-step totals. */
function goldenNight() {
  const night = new Night();
  const steps: { bankCash: number; chipsOnTable: number }[] = [];
  const snap = () => {
    const t = tableTotals(night.state.stints);
    steps.push({ bankCash: t.bankCash, chipsOnTable: t.chipsOnTable });
  };
  const stint: Record<string, string> = {};
  const join = (n: Name, sid: string) => {
    stint[sid] = sid;
    night.add('PLAYER_JOINED', { stintId: sid, memberId: M[n] });
    night.add('BUY_IN', { stintId: sid, amount: 500 });
  };

  night.add('SESSION_STARTED', { title: 'Diwali Night', buyIn: 500, topUp: 500, bankHolderMemberId: M.Amit });
  // 1
  for (const n of ['Amit', 'Rohit', 'Priya', 'Kunal', 'Sana'] as const) join(n, n);
  snap();
  // 2
  night.add('SHORT_TAKEN', { stintId: 'Rohit', amount: 300 });
  snap();
  // 3
  night.add('TOP_UP', { stintId: 'Kunal', amount: 500 });
  snap();
  // 4
  night.add('SHORT_REPAID', { stintId: 'Rohit', amount: 200, method: 'cash' });
  snap();
  // 5
  night.add('PLAYER_LEFT', { stintId: 'Sana', finalChips: 900, settledNow: 900 });
  snap();
  // 6
  join('Sana', 'Sana2');
  snap();
  // 7
  night.add('SHORT_TAKEN', { stintId: 'Priya', amount: 200 });
  snap();
  return { night, steps };
}

function count(night: Night, counts: Partial<Record<string, number>>) {
  night.add('COUNTING_STARTED', {});
  for (const [stintId, finalChips] of Object.entries(counts))
    night.add('FINAL_COUNT', { stintId, finalChips: finalChips! });
}

describe('golden worked example (§5.6)', () => {
  it('bank cash and chips on table after each step', () => {
    const { steps } = goldenNight();
    expect(steps).toEqual([
      { bankCash: 2500, chipsOnTable: 2500 },
      { bankCash: 2500, chipsOnTable: 2800 },
      { bankCash: 3000, chipsOnTable: 3300 },
      { bankCash: 3200, chipsOnTable: 3300 },
      { bankCash: 2300, chipsOnTable: 2400 },
      { bankCash: 2800, chipsOnTable: 2900 },
      { bankCash: 2800, chipsOnTable: 3100 },
    ]);
  });

  it('final count matches, per-stint values, positions and transfers', () => {
    const { night } = goldenNight();
    count(night, { Amit: 300, Rohit: 1200, Priya: 0, Kunal: 1000, Sana2: 600 });
    const s = night.state;
    expect(reconcile(s.stints)).toEqual({ expected: 3100, counted: 3100, gap: 0 });

    const row = (id: string) => {
      const st = stintOf(s, id)!;
      const d = derive(st);
      return [d.netChips, d.shortOutstanding, st.final, d.bankOwes, d.pnl];
    };
    expect(row('Amit')).toEqual([500, 0, 300, 300, -200]);
    expect(row('Rohit')).toEqual([800, 100, 1200, 1100, 400]);
    expect(row('Priya')).toEqual([700, 200, 0, -200, -700]);
    expect(row('Kunal')).toEqual([1000, 0, 1000, 1000, 0]);
    expect(row('Sana')).toEqual([500, 0, 900, 900, 400]);
    expect(row('Sana2')).toEqual([500, 0, 600, 600, 100]);
    expect(s.stints.reduce((a, st) => a + derive(st).pnl!, 0)).toBe(0);

    const st = settlement(s, nameOf);
    expect(st.positions).toEqual({
      [M.Amit]: -2500,
      [M.Rohit]: 1100,
      [M.Priya]: -200,
      [M.Kunal]: 1000,
      [M.Sana]: 600,
    });
    expect(st.transfers.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)} ₹${t.amount}`)).toEqual([
      'Amit → Rohit ₹1100',
      'Amit → Kunal ₹1000',
      'Amit → Sana ₹400',
      'Priya → Sana ₹200',
    ]);
    expect(st.viaBank.map((v) => [nameOf(v.memberId), v.amount])).toEqual([
      ['Kunal', 1000],
      ['Priya', -200],
      ['Rohit', 1100],
      ['Sana', 600],
    ]);

    const results = nightResults(s, nameOf);
    expect(results.map((r) => [nameOf(r.memberId), r.pnl, r.titles])).toEqual([
      ['Sana', 500, ['raja']],
      ['Rohit', 400, ['comeback']],
      ['Kunal', 0, ['steady']],
      ['Amit', -200, []],
      ['Priya', -700, []],
    ]);

    night.add('SESSION_CLOSED', {});
    expect(night.state.status).toBe('closed');
  });

  it('miscount shows ₹100 missing from the table and blocks close', () => {
    const { night } = goldenNight();
    count(night, { Amit: 300, Rohit: 1200, Priya: 0, Kunal: 900, Sana2: 600 });
    expect(reconcile(night.state.stints).gap).toBe(-100);
    expect(night.try('SESSION_CLOSED', {})).toBe(false);
  });

  it('projecting the event list equals the incremental state', () => {
    const { night } = goldenNight();
    const shuffled = [...night.events].reverse() as LedgerEvent[];
    expect(project(shuffled)).toEqual(night.state);
  });
});
