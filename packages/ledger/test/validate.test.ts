import { describe, expect, it } from 'vitest';
import { canApply, derive, planAdjustment, project, reconcile, stintOf, tableTotals } from '../src';
import { Night } from './helpers';

function table(players = ['a', 'b', 'c']) {
  const night = new Night();
  night.add('SESSION_STARTED', { title: 'T', buyIn: 500, topUp: 500, bankHolderMemberId: 'a' });
  for (const m of players) {
    night.add('PLAYER_JOINED', { stintId: `s-${m}`, memberId: m });
    night.add('BUY_IN', { stintId: `s-${m}`, amount: 500 });
  }
  return night;
}

const reject = (night: Night, ...args: Parameters<Night['make']>) => {
  const r = canApply(night.state, night.make(...args));
  if (r.ok) throw new Error('expected rejection');
  return r;
};

describe('validation rules (§5.7)', () => {
  it('repay ≤ shortOutstanding, message shows the max', () => {
    const n = table();
    n.add('SHORT_TAKEN', { stintId: 's-b', amount: 300 });
    const r = reject(n, 'SHORT_REPAID', { stintId: 's-b', amount: 301, method: 'cash' });
    expect(r.code).toBe('repay_exceeds');
    expect(r.params).toEqual({ max: 300 });
    n.add('SHORT_REPAID', { stintId: 's-b', amount: 300, method: 'chips' });
  });

  it('amounts > 0 and integers', () => {
    const n = table();
    expect(reject(n, 'TOP_UP', { stintId: 's-b', amount: 0 }).code).toBe('invalid_payload');
    expect(reject(n, 'SHORT_TAKEN', { stintId: 's-b', amount: -5 }).code).toBe('invalid_payload');
    expect(reject(n, 'SHORT_TAKEN', { stintId: 's-b', amount: 1.5 }).code).toBe('invalid_payload');
  });

  it('no events on a left stint', () => {
    const n = table();
    n.add('PLAYER_LEFT', { stintId: 's-b', finalChips: 500, settledNow: 500 });
    expect(reject(n, 'TOP_UP', { stintId: 's-b', amount: 500 }).code).toBe('stint_left');
  });

  it('one active stint per member; rejoin after leaving is fine', () => {
    const n = table();
    expect(reject(n, 'PLAYER_JOINED', { stintId: 's-b2', memberId: 'b' }).code).toBe('member_active');
    n.add('PLAYER_LEFT', { stintId: 's-b', finalChips: 0, settledNow: 0 });
    n.add('PLAYER_JOINED', { stintId: 's-b2', memberId: 'b' });
  });

  it('no FINAL_COUNT before counting has started', () => {
    const n = table();
    expect(reject(n, 'FINAL_COUNT', { stintId: 's-b', finalChips: 500 }).code).toBe('not_counting');
  });

  it('no leave while the player holds the bank', () => {
    const n = table();
    expect(reject(n, 'PLAYER_LEFT', { stintId: 's-a', finalChips: 500, settledNow: 500 }).code).toBe(
      'bank_holder_must_handover',
    );
    n.add('BANK_TRANSFERRED', { fromMemberId: 'a', toMemberId: 'b', counted: 1500, expected: 1500 });
    n.add('PLAYER_LEFT', { stintId: 's-a', finalChips: 500, settledNow: 500 });
  });

  it('live actions are locked while counting; reopening clears counts', () => {
    const n = table();
    n.add('COUNTING_STARTED', {});
    expect(reject(n, 'TOP_UP', { stintId: 's-b', amount: 500 }).code).toBe('not_live');
    n.add('FINAL_COUNT', { stintId: 's-b', finalChips: 400 });
    n.add('COUNTING_REOPENED', {});
    expect(stintOf(n.state, 's-b')!.final).toBeNull();
    n.add('TOP_UP', { stintId: 's-b', amount: 500 });
  });

  it('max 12 players at the table', () => {
    const n = table(Array.from({ length: 12 }, (_, i) => `p${i}`).map((x, i) => (i === 0 ? 'a' : x)));
    expect(reject(n, 'PLAYER_JOINED', { stintId: 's-x', memberId: 'x' }).code).toBe('table_full');
  });
});

describe('leave and settle on the spot (§5.5, §8.6)', () => {
  it("leaver's short exceeds chips → negative bankOwes; settle range follows the sign", () => {
    const n = table();
    n.add('SHORT_TAKEN', { stintId: 's-b', amount: 650 });
    const owes = 500 - 650;
    expect(reject(n, 'PLAYER_LEFT', { stintId: 's-b', finalChips: 500, settledNow: 100 }).code).toBe(
      'settle_out_of_range',
    );
    n.add('PLAYER_LEFT', { stintId: 's-b', finalChips: 500, settledNow: owes });
    expect(derive(stintOf(n.state, 's-b')!).bankOwes).toBe(-150);
  });

  it("bank can't pay more than it holds; partial settle defers the rest", () => {
    const n = table();
    n.add('SHORT_TAKEN', { stintId: 's-b', amount: 2000 });
    // b won big: holds 2500 chips + the bank's 1500 cash is not enough for 2500 − 2000 short… use c instead
    expect(tableTotals(n.state.stints).bankCash).toBe(1500);
    const r = reject(n, 'PLAYER_LEFT', { stintId: 's-c', finalChips: 2000, settledNow: 2000 });
    expect(r.code).toBe('bank_short');
    n.add('PLAYER_LEFT', { stintId: 's-c', finalChips: 2000, settledNow: 1500 });
    expect(derive(stintOf(n.state, 's-c')!).deferred).toBe(500);
  });

  it('0 chips at the end is valid and shows a full loss', () => {
    const n = table();
    n.add('PLAYER_LEFT', { stintId: 's-b', finalChips: 0, settledNow: 0 });
    expect(derive(stintOf(n.state, 's-b')!).pnl).toBe(-500);
  });
});

describe('voiding (§6)', () => {
  it('voiding PLAYER_LEFT reopens the stint', () => {
    const n = table();
    const left = n.add('PLAYER_LEFT', { stintId: 's-b', finalChips: 300, settledNow: 300 });
    n.add('EVENT_VOIDED', { targetId: left.id, reason: 'undo' });
    const s = stintOf(n.state, 's-b')!;
    expect(s.left).toBe(false);
    expect(s.final).toBeNull();
    expect(n.state.log.find((l) => l.event.id === left.id)!.voided?.reason).toBe('undo');
  });

  it("voiding a stint's only BUY_IN also voids the PLAYER_JOINED", () => {
    const n = table();
    n.add('PLAYER_JOINED', { stintId: 's-d', memberId: 'd' });
    const buy = n.add('BUY_IN', { stintId: 's-d', amount: 500 });
    n.add('EVENT_VOIDED', { targetId: buy.id, reason: 'wrong_player' });
    expect(stintOf(n.state, 's-d')).toBeUndefined();
    const join = n.state.log.find((l) => l.event.type === 'PLAYER_JOINED' && l.event.payload.stintId === 's-d')!;
    expect(join.voided?.implied).toBe(true);
    // d can join again
    n.add('PLAYER_JOINED', { stintId: 's-d2', memberId: 'd' });
  });

  it('a void that would break a later entry is rejected', () => {
    const n = table();
    const short = n.add('SHORT_TAKEN', { stintId: 's-b', amount: 300 });
    n.add('SHORT_REPAID', { stintId: 's-b', amount: 200, method: 'cash' });
    const r = reject(n, 'EVENT_VOIDED', { targetId: short.id, reason: 'wrong_amount' });
    expect(r.code).toBe('void_breaks_log');
  });

  it('cannot void twice, cannot void structural events, nothing after close', () => {
    const n = table();
    const top = n.add('TOP_UP', { stintId: 's-b', amount: 500 });
    n.add('EVENT_VOIDED', { targetId: top.id, reason: 'duplicate' });
    expect(reject(n, 'EVENT_VOIDED', { targetId: top.id, reason: 'duplicate' }).code).toBe('already_voided');
    expect(reject(n, 'EVENT_VOIDED', { targetId: 'e1', reason: 'other' }).code).toBe('not_voidable');

    n.add('COUNTING_STARTED', {});
    for (const s of ['s-a', 's-b', 's-c']) n.add('FINAL_COUNT', { stintId: s, finalChips: 500 });
    n.add('SESSION_CLOSED', {});
    const count = n.events.find((e) => e.type === 'FINAL_COUNT')!;
    expect(reject(n, 'EVENT_VOIDED', { targetId: count.id, reason: 'other' }).code).toBe('closed');
    expect(reject(n, 'SESSION_REOPENED', { reason: '' }).code).toBe('invalid_payload');
    n.add('SESSION_REOPENED', { reason: 'Kunal recounted' });
    n.add('EVENT_VOIDED', { targetId: count.id, reason: 'other' });
  });

  it('FINAL_COUNT re-entry: latest wins; voiding it falls back to the previous one', () => {
    const n = table();
    n.add('COUNTING_STARTED', {});
    n.add('FINAL_COUNT', { stintId: 's-b', finalChips: 400 });
    const second = n.add('FINAL_COUNT', { stintId: 's-b', finalChips: 450 });
    expect(stintOf(n.state, 's-b')!.final).toBe(450);
    n.add('EVENT_VOIDED', { targetId: second.id, reason: 'wrong_amount' });
    expect(stintOf(n.state, 's-b')!.final).toBe(400);
  });
});

describe('gap resolution (§5.4)', () => {
  function miscounted(gapDelta: number) {
    const n = table(['a', 'b', 'c']);
    n.add('COUNTING_STARTED', {});
    n.add('FINAL_COUNT', { stintId: 's-a', finalChips: 500 });
    n.add('FINAL_COUNT', { stintId: 's-b', finalChips: 500 });
    n.add('FINAL_COUNT', { stintId: 's-c', finalChips: 500 + gapDelta });
    return n;
  }

  it('split equally with remainder ₹1 at a time in seat order', () => {
    const n = miscounted(-100);
    expect(reconcile(n.state.stints).gap).toBe(-100);
    expect(planAdjustment(n.state, 'split_equal')).toEqual([
      { stintId: 's-a', amount: 34 },
      { stintId: 's-b', amount: 33 },
      { stintId: 's-c', amount: 33 },
    ]);
    const extra = miscounted(200);
    expect(planAdjustment(extra.state, 'split_equal').map((a) => a.amount)).toEqual([-67, -67, -66]);
  });

  it('bank absorbs / assigned, then the night can close', () => {
    const n = miscounted(-100);
    expect(planAdjustment(n.state, 'bank_absorbs')).toEqual([{ stintId: 's-a', amount: 100 }]);
    expect(planAdjustment(n.state, 'assigned', 's-c')).toEqual([{ stintId: 's-c', amount: 100 }]);
    expect(n.try('SESSION_CLOSED', {})).toBe(false);
    for (const a of planAdjustment(n.state, 'assigned', 's-c'))
      n.add('ADJUSTMENT', { ...a, resolution: 'assigned', gapAtTime: -100 });
    n.add('SESSION_CLOSED', {});
  });
});

describe('performance', () => {
  it('projects 1,000 events in < 5 ms', () => {
    const n = table(Array.from({ length: 12 }, (_, i) => (i === 0 ? 'a' : `p${i}`)));
    const ids = n.state.stints.map((s) => s.id);
    while (n.events.length < 1000) {
      const id = ids[n.events.length % ids.length]!;
      n.add('SHORT_TAKEN', { stintId: id, amount: 100 });
      n.add('SHORT_REPAID', { stintId: id, amount: 50, method: 'cash' });
    }
    for (let i = 0; i < 20; i++) project(n.events); // warm up
    const t = performance.now();
    const runs = 50;
    for (let i = 0; i < runs; i++) project(n.events);
    expect((performance.now() - t) / runs).toBeLessThan(5);
  });
});
