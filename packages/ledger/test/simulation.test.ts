import { describe, expect, it } from 'vitest';
import {
  activeStintOfMember,
  activeStints,
  canApply,
  derive,
  isSettleable,
  MAX_PLAYERS,
  nightResults,
  planAdjustment,
  project,
  reconcile,
  settlement,
  tableTotals,
  type EventType,
  type LedgerEvent,
  type PayloadOf,
} from '../src';
import { Night } from './helpers';

/**
 * A scripted 15-person night that walks through every event type and edge case in order.
 * Physical chips and the bank's cash are tracked on the side, and every step checks that
 * the ledger agrees with what is physically on the table.
 */
const CAST = [
  'Amit', 'Rohit', 'Priya', 'Kunal', 'Sana', 'Vikram', 'Neha', 'Arjun',
  'Pooja', 'Rahul', 'Simran', 'Karan', 'Anjali', 'Dev', 'Meera',
] as const;
type Name = (typeof CAST)[number] | 'Guest';
const BUY_IN = 500;
const nameOf = (id: string) => id;

class Table {
  night = new Night();
  /** Physical chips in front of each active stint. */
  chips = new Map<string, number>();
  /** Physical cash in the bank. */
  bank = 0;
  private stintN = 0;

  stint(name: Name) {
    const s = activeStintOfMember(this.night.state, name);
    if (!s) throw new Error(`${name} is not at the table`);
    return s;
  }

  add<T extends EventType>(type: T, payload: PayloadOf<T>): LedgerEvent {
    const e = this.night.add(type, payload);
    this.check();
    return e;
  }

  /** The ledger's error code for an event, without appending it. */
  reject<T extends EventType>(type: T, payload: PayloadOf<T>) {
    const r = canApply(this.night.state, this.night.make(type, payload));
    return r.ok ? 'ok' : r.code;
  }

  join(name: Name) {
    const stintId = `st${++this.stintN}`;
    const j = this.night.add('PLAYER_JOINED', { stintId, memberId: name });
    const b = this.night.add('BUY_IN', { stintId, amount: BUY_IN });
    this.chips.set(stintId, BUY_IN);
    this.bank += BUY_IN;
    this.check();
    return Object.assign([j, b] as const, { stintId });
  }

  topUp(name: Name) {
    const s = this.stint(name);
    const e = this.night.add('TOP_UP', { stintId: s.id, amount: BUY_IN });
    this.chips.set(s.id, this.chips.get(s.id)! + BUY_IN);
    this.bank += BUY_IN;
    this.check();
    return e;
  }

  short(name: Name, amount: number) {
    const s = this.stint(name);
    const e = this.night.add('SHORT_TAKEN', { stintId: s.id, amount });
    this.chips.set(s.id, this.chips.get(s.id)! + amount);
    this.check();
    return e;
  }

  repay(name: Name, amount: number, method: 'cash' | 'chips') {
    const s = this.stint(name);
    const e = this.night.add('SHORT_REPAID', { stintId: s.id, amount, method });
    if (method === 'cash') this.bank += amount;
    else this.chips.set(s.id, this.chips.get(s.id)! - amount);
    this.check();
    return e;
  }

  /** Chips change hands during play. */
  pot(winner: Name, losers: Partial<Record<Name, number>>) {
    const w = this.stint(winner);
    for (const [n, amt] of Object.entries(losers) as [Name, number][]) {
      const s = this.stint(n);
      if (this.chips.get(s.id)! < amt) throw new Error(`${n} only has ${this.chips.get(s.id)}`);
      this.chips.set(s.id, this.chips.get(s.id)! - amt);
      this.chips.set(w.id, this.chips.get(w.id)! + amt);
    }
    this.check();
  }

  held(name: Name) {
    return this.chips.get(this.stint(name).id)!;
  }

  /** Leaves with their real chips; settles `settle(owes)` on the spot. */
  leave(name: Name, settle: (owes: number) => number = (o) => o) {
    const s = this.stint(name);
    const finalChips = this.chips.get(s.id)!;
    const owes = finalChips - derive(s).shortOutstanding;
    const settledNow = settle(owes);
    const e = this.night.add('PLAYER_LEFT', { stintId: s.id, finalChips, settledNow });
    this.chips.delete(s.id);
    this.bank -= settledNow;
    this.check();
    return { e, owes, settledNow, stintId: s.id };
  }

  /** What the Undo toast does: void every event of the action, latest first, in one batch. */
  undo(...events: LedgerEvent[]) {
    for (const e of [...events].reverse()) this.night.add('EVENT_VOIDED', { targetId: e.id, reason: 'undo' });
  }

  /** The ledger matches the physical table, and a full replay matches the incremental state. */
  check() {
    const { state, events } = this.night;
    if (state.status === 'live') {
      const t = tableTotals(state.stints);
      const physical = [...this.chips.values()].reduce((a, b) => a + b, 0);
      expect(t.chipsOnTable).toBe(physical);
      expect(t.bankCash).toBe(this.bank);
      expect(t.bankCash).toBeGreaterThanOrEqual(0);
    }
    expect(project(events)).toEqual(state);
  }
}

describe('15-person night simulation', () => {
  it('plays a full night with every edge case', () => {
    const t = new Table();
    const { night } = t;

    // ── Setup: 12 sit down, 3 arrive late. Amit hosts and holds the bank. Kitty ₹100 with Meera.
    t.add('SESSION_STARTED', {
      title: 'Diwali Night',
      buyIn: BUY_IN,
      topUp: BUY_IN,
      bankHolderMemberId: 'Amit',
      kitty: { amount: 100, holderMemberId: 'Meera' },
    });
    expect(t.reject('SESSION_STARTED', { title: 'Again', buyIn: 1, topUp: 1, bankHolderMemberId: 'Amit' })).toBe('already_started');
    for (const n of CAST) t.join(n);
    expect(activeStints(night.state)).toHaveLength(15);
    expect(MAX_PLAYERS).toBeGreaterThanOrEqual(15);
    expect(t.bank).toBe(7500);
    expect(t.reject('PLAYER_JOINED', { stintId: 'dupe', memberId: 'Rohit' })).toBe('member_active');
    expect(t.reject('PLAYER_JOINED', { stintId: 'st1', memberId: 'Guest' })).toBe('duplicate_stint');

    // ── Kitty: everyone pays except Dev, who was ticked by mistake and unticked.
    for (const n of CAST) t.add('KITTY_MARKED', { memberId: n, paid: true });
    t.add('KITTY_MARKED', { memberId: 'Dev', paid: false });
    expect(Object.values(night.state.kittyPaid).filter(Boolean)).toHaveLength(14);

    // ── A guest is added by mistake and undone straight away (join + buy-in in one undo).
    const guest = t.join('Guest');
    t.bank -= BUY_IN;
    t.chips.delete(guest.stintId);
    t.undo(...guest);
    t.check();
    expect(activeStintOfMember(night.state, 'Guest')).toBeUndefined();

    // ── Early play: top-ups, shorts, pots.
    t.pot('Rohit', { Priya: 300, Kunal: 200, Sana: 100 });
    t.pot('Neha', { Vikram: 450, Arjun: 500 });
    t.topUp('Arjun');
    const wrongTopUp = t.topUp('Priya');
    t.undo(wrongTopUp); // tapped the wrong card
    t.bank -= BUY_IN;
    t.chips.set(t.stint('Priya').id, t.held('Priya') - BUY_IN);
    t.check();
    t.short('Vikram', 300);
    t.short('Pooja', 200);
    t.short('Rahul', BUY_IN);
    t.short('Rahul', 100);
    t.short('Rahul', 250); // 3 shorts → short king candidate
    t.pot('Kunal', { Rahul: 850, Pooja: 400 });

    // Fix via the log: Simran's ₹2,000 short should have been ₹200. Void + corrected event together.
    const typo = t.short('Simran', 2000);
    night.add('EVENT_VOIDED', { targetId: typo.id, reason: 'wrong_amount', note: 'fix:next' });
    t.chips.set(t.stint('Simran').id, t.held('Simran') - 2000);
    t.short('Simran', 200);

    // ── Repays: validation, partial cash, chips, full.
    expect(t.reject('SHORT_REPAID', { stintId: t.stint('Amit').id, amount: 1, method: 'cash' })).toBe('repay_exceeds');
    expect(t.reject('SHORT_REPAID', { stintId: t.stint('Rahul').id, amount: 851, method: 'cash' })).toBe('repay_exceeds');
    expect(t.reject('SHORT_REPAID', { stintId: t.stint('Rahul').id, amount: 0, method: 'cash' })).toBe('invalid_payload');
    t.repay('Rahul', 350, 'cash');
    t.repay('Simran', 200, 'chips');
    expect(derive(t.stint('Simran')).shortOutstanding).toBe(0);
    t.repay('Pooja', 100, 'cash');

    // A void that would break later entries is refused: Rahul's ₹500 short has been part-repaid against.
    const rahulShorts = night.events.filter((e) => e.type === 'SHORT_TAKEN' && e.payload.stintId === t.stint('Rahul').id);
    // Outstanding 500 after the ₹350 cash repay; voiding the ₹500 short leaves repaid 350 > taken 350? No: taken 350, repaid 350 → fine.
    // Voiding both the ₹500 and ₹250 shorts would leave repaid 350 > taken 100.
    night.add('EVENT_VOIDED', { targetId: rahulShorts[2]!.id, reason: 'wrong_player' });
    t.chips.set(t.stint('Rahul').id, t.held('Rahul') - 250);
    expect(t.reject('EVENT_VOIDED', { targetId: rahulShorts[0]!.id, reason: 'other' })).toBe('void_breaks_log');
    t.short('Rahul', 250); // re-entered on the right night after all
    t.check();

    // ── Bank check: counted short by ₹50 (non-blocking, logged).
    const expected = tableTotals(night.state.stints).bankCash;
    t.add('BANK_CHECK', { counted: expected - 50, expected });
    expect(night.state.bankChecks).toHaveLength(1);

    // ── Leaves.
    // Sana: winner leaves, bank pays in full.
    t.pot('Sana', { Rohit: 400 });
    const sana = t.leave('Sana');
    expect(sana.owes).toBeGreaterThan(0);
    // Vikram: short exceeds chips → he pays the bank.
    t.pot('Neha', { Vikram: 300 });
    const vikram = t.leave('Vikram');
    expect(vikram.owes).toBeLessThan(0);
    expect(vikram.settledNow).toBeLessThan(0);
    // Pooja: owes the bank but can only pay part now; the rest is deferred.
    t.pot('Kunal', { Pooja: t.held('Pooja') });
    const pooja = t.leave('Pooja', (o) => Math.ceil(o / 2));
    expect(derive(night.state.stints.find((s) => s.id === pooja.stintId)!).deferred).toBeLessThan(0);
    // Out-of-range settle amounts are refused.
    const neha = t.stint('Neha');
    const nehaOwes = t.held('Neha') - derive(neha).shortOutstanding;
    expect(t.reject('PLAYER_LEFT', { stintId: neha.id, finalChips: t.held('Neha'), settledNow: nehaOwes + 1 })).toBe('settle_out_of_range');
    expect(t.reject('PLAYER_LEFT', { stintId: neha.id, finalChips: t.held('Neha'), settledNow: -1 })).toBe('settle_out_of_range');
    // Arjun leaves with 0 chips and no short: valid, full loss.
    t.pot('Neha', { Arjun: t.held('Arjun') });
    const arjun = t.leave('Arjun');
    expect(arjun.owes).toBe(0);
    // Wrong player marked as left: void the leave, the stint reopens with its chips.
    t.chips.set(arjun.stintId, 0);
    t.bank += arjun.settledNow;
    night.add('EVENT_VOIDED', { targetId: arjun.e.id, reason: 'wrong_player' });
    t.check();
    expect(t.stint('Arjun').left).toBe(false);
    t.leave('Arjun');
    // Events on a left stint are refused.
    expect(t.reject('TOP_UP', { stintId: arjun.stintId, amount: BUY_IN })).toBe('stint_left');

    // ── Bank short: the big winner wants more than the bank holds. Most chips sit with Kunal;
    // outstanding shorts mean chips on the table exceed the bank's cash.
    for (const n of ['Rohit', 'Priya', 'Neha', 'Rahul', 'Karan', 'Anjali', 'Dev'] as const)
      t.pot('Kunal', { [n]: Math.floor(t.held(n) * 0.9) });
    t.short('Karan', 1500);
    t.short('Anjali', 1500);
    t.pot('Kunal', { Karan: 1500, Anjali: 1500 });
    const kunal = t.stint('Kunal');
    const kunalOwes = t.held('Kunal') - derive(kunal).shortOutstanding;
    const bankNow = tableTotals(night.state.stints).bankCash;
    expect(kunalOwes).toBeGreaterThan(bankNow);
    expect(t.reject('PLAYER_LEFT', { stintId: kunal.id, finalChips: t.held('Kunal'), settledNow: kunalOwes })).toBe('bank_short');
    t.leave('Kunal', () => bankNow); // pay what the bank has; rest at the end
    expect(tableTotals(night.state.stints).bankCash).toBe(0);
    // With an empty bank a positive leave must defer everything.
    t.pot('Meera', { Dev: 10 });
    const meera = t.stint('Meera');
    expect(t.reject('PLAYER_LEFT', { stintId: meera.id, finalChips: t.held('Meera'), settledNow: 1 })).toBe('bank_short');

    // ── Rejoins: Sana comes back twice (3 stints in one night).
    t.join('Sana');
    t.pot('Meera', { Sana: 200 });
    t.leave('Sana');
    const rejoin = t.join('Sana');
    t.undo(...rejoin); // rejoined by mistake
    t.bank -= BUY_IN;
    t.chips.delete(rejoin.stintId);
    t.check();
    expect(activeStintOfMember(night.state, 'Sana')).toBeUndefined();
    t.join('Sana');
    expect(night.state.stints.filter((s) => s.memberId === 'Sana')).toHaveLength(3);

    // ── Bank holder wants to leave: blocked until the bank is handed over.
    const amit = t.stint('Amit');
    expect(t.reject('PLAYER_LEFT', { stintId: amit.id, finalChips: t.held('Amit'), settledNow: 0 })).toBe('bank_holder_must_handover');
    const bankCash = tableTotals(night.state.stints).bankCash;
    expect(t.reject('BANK_TRANSFERRED', { fromMemberId: 'Rohit', toMemberId: 'Priya', counted: 0, expected: 0 })).toBe('not_bank_holder');
    expect(t.reject('BANK_TRANSFERRED', { fromMemberId: 'Amit', toMemberId: 'Amit', counted: 0, expected: 0 })).toBe('same_member');
    expect(t.reject('BANK_TRANSFERRED', { fromMemberId: 'Amit', toMemberId: 'Kunal', counted: 0, expected: 0 })).toBe('stint_left');
    t.add('BANK_TRANSFERRED', { fromMemberId: 'Amit', toMemberId: 'Priya', counted: bankCash, expected: bankCash });
    t.leave('Amit');
    // Host hands over to Priya's account (server RPC writes this event).
    t.add('HOST_TRANSFERRED', { fromUserId: 'u-host', toUserId: 'u-priya', forced: false });
    expect(night.state.hostUserId).toBe('u-priya');
    // Voiding the bank handover would leave Amit's leave invalid.
    const handover = night.state.bankTransfers[0]!;
    expect(t.reject('EVENT_VOIDED', { targetId: handover.id, reason: 'other' })).toBe('void_breaks_log');

    // Late top-ups refill the bank.
    t.topUp('Rohit');
    t.topUp('Dev');

    // ── Counting: live actions lock; going back clears the counts.
    t.add('COUNTING_STARTED', {});
    expect(t.reject('TOP_UP', { stintId: t.stint('Rohit').id, amount: BUY_IN })).toBe('not_live');
    expect(t.reject('SESSION_CLOSED', {})).toBe('not_counted');
    expect(t.reject('TRANSFER_MARKED', { from: 'Rohit', to: 'Priya', amount: 1, paid: true })).toBe('gap_not_zero');
    t.add('FINAL_COUNT', { stintId: t.stint('Rohit').id, finalChips: t.held('Rohit') });
    t.add('COUNTING_REOPENED', {});
    expect(t.stint('Rohit').final).toBeNull();
    t.pot('Dev', { Rohit: 100 });
    t.add('COUNTING_STARTED', {});

    // Everyone at the table is counted; Neha is miscounted, then recounted (latest wins).
    const active = activeStints(night.state);
    expect(active.map((s) => s.memberId).sort()).toEqual(
      ['Anjali', 'Dev', 'Karan', 'Meera', 'Neha', 'Priya', 'Rahul', 'Rohit', 'Sana', 'Simran'].sort(),
    );
    for (const s of active) t.add('FINAL_COUNT', { stintId: s.id, finalChips: t.chips.get(s.id)! });
    expect(reconcile(night.state.stints).gap).toBe(0);
    t.add('FINAL_COUNT', { stintId: t.stint('Neha').id, finalChips: t.held('Neha') - 150 });
    expect(reconcile(night.state.stints).gap).toBe(-150);
    t.add('FINAL_COUNT', { stintId: t.stint('Neha').id, finalChips: t.held('Neha') });
    expect(isSettleable(night.state)).toBe(true);

    // A ₹13 chip rolled under the sofa: split equally across the 10 players, remainder in seat order.
    const simran = t.stint('Simran');
    t.add('FINAL_COUNT', { stintId: simran.id, finalChips: t.held('Simran') - 13 });
    const gap = reconcile(night.state.stints).gap;
    expect(gap).toBe(-13);
    const plan = planAdjustment(night.state, 'split_equal');
    expect(plan.reduce((a, p) => a + p.amount, 0)).toBe(13);
    expect(plan.map((p) => p.amount)).toEqual([2, 2, 2, 1, 1, 1, 1, 1, 1, 1]);
    for (const p of plan) t.add('ADJUSTMENT', { ...p, resolution: 'split_equal', gapAtTime: gap });
    expect(reconcile(night.state.stints).gap).toBe(0);

    // ── Settlement.
    const results = nightResults(night.state, nameOf);
    expect(results).toHaveLength(15);
    expect(results.reduce((a, r) => a + r.pnl, 0)).toBe(0);
    expect(results.find((r) => r.memberId === 'Sana')!.stints).toBe(3);
    expect(results.filter((r) => r.adjusted)).toHaveLength(10);
    expect(results[0]!.titles).toContain('raja');
    expect(results.find((r) => r.memberId === 'Rahul')!.titles).toContain('short_king');
    expect(results.flatMap((r) => r.titles).filter((x) => x === 'steady')).toHaveLength(1);

    const st = settlement(night.state, nameOf);
    expect(st.bankHolderMemberId).toBe('Priya');
    expect(Object.values(st.positions).reduce((a, b) => a + b, 0)).toBe(0);
    const bal = { ...st.positions };
    for (const tr of st.transfers) {
      expect(tr.amount).toBeGreaterThan(0);
      bal[tr.from]! += tr.amount;
      bal[tr.to]! -= tr.amount;
    }
    expect(Object.values(bal).every((v) => v === 0)).toBe(true);
    const nonZero = Object.values(st.positions).filter((v) => v !== 0).length;
    expect(st.transfers.length).toBeLessThanOrEqual(nonZero - 1);

    // Every person's cash in/out equals their result (the bank's cash counts as Priya's).
    const net: Record<string, number> = {};
    const pnl: Record<string, number> = {};
    for (const s of night.state.stints) {
      const d = derive(s);
      net[s.memberId] = (net[s.memberId] ?? 0) - d.cashIn + (s.left ? s.settledNow : 0);
      pnl[s.memberId] = (pnl[s.memberId] ?? 0) + d.pnl!;
    }
    for (const tr of st.transfers) {
      net[tr.from]! -= tr.amount;
      net[tr.to]! += tr.amount;
    }
    net[st.bankHolderMemberId]! += tableTotals(night.state.stints).bankCash;
    for (const id of Object.keys(pnl)) expect(net[id], id).toBe(pnl[id]);

    // Mark payments as done; one is unticked again.
    for (const tr of st.transfers) t.add('TRANSFER_MARKED', { ...tr, paid: true });
    const first = st.transfers[0]!;
    t.add('TRANSFER_MARKED', { ...first, paid: false });
    expect(Object.values(night.state.transferMarks).filter((m) => m.paid)).toHaveLength(st.transfers.length - 1);

    // ── Close, then nothing changes until it's reopened with a reason.
    t.add('SESSION_CLOSED', {});
    expect(t.reject('FINAL_COUNT', { stintId: simran.id, finalChips: 0 })).toBe('closed');
    expect(t.reject('EVENT_VOIDED', { targetId: first.from, reason: 'other' })).toBe('closed');
    expect(t.reject('SESSION_REOPENED', { reason: '' })).toBe('invalid_payload');
    t.add('SESSION_REOPENED', { reason: 'Found the ₹13 chip' });
    expect(night.state.status).toBe('counting');
    const adjustments = night.events.filter((e) => e.type === 'ADJUSTMENT');
    t.add('FINAL_COUNT', { stintId: simran.id, finalChips: t.held('Simran') });
    for (const a of adjustments) night.add('EVENT_VOIDED', { targetId: a.id, reason: 'other', note: 'chip found' });
    t.check();
    expect(reconcile(night.state.stints).gap).toBe(0);
    expect(nightResults(night.state, nameOf).every((r) => !r.adjusted)).toBe(true);
    t.add('SESSION_CLOSED', {});
    expect(night.state.status).toBe('closed');

    // Every event type was exercised.
    const types = new Set(night.events.map((e) => e.type));
    expect([...types].sort()).toEqual(
      [
        'ADJUSTMENT', 'BANK_CHECK', 'BANK_TRANSFERRED', 'BUY_IN', 'COUNTING_REOPENED', 'COUNTING_STARTED',
        'EVENT_VOIDED', 'FINAL_COUNT', 'HOST_TRANSFERRED', 'KITTY_MARKED', 'PLAYER_JOINED', 'PLAYER_LEFT',
        'SESSION_CLOSED', 'SESSION_REOPENED', 'SESSION_STARTED', 'SHORT_REPAID', 'SHORT_TAKEN', 'TOP_UP',
        'TRANSFER_MARKED',
      ].sort(),
    );
  });
});
