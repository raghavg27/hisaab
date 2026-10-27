import { applyEvent, canApply, emptyState, type EventType, type LedgerEvent, type PayloadOf } from '@hisaab/ledger';
import { describe, expect, it } from 'vitest';
import { shareText } from '@/lib/share';

function golden() {
  const state = emptyState();
  let n = 0;
  const add = <T extends EventType>(type: T, payload: PayloadOf<T>) => {
    n++;
    const e = { id: `e${n}`, sessionId: 's', seq: n, hostEpoch: 1, type, payload, actorUserId: 'u', clientTs: '2026-11-08T14:00:00Z' } as LedgerEvent;
    const r = canApply(state, e);
    if (!r.ok) throw new Error(r.message);
    state.log.push({ event: e, voided: null });
    applyEvent(state, e);
  };
  add('SESSION_STARTED', { title: 'Diwali Night', buyIn: 500, topUp: 500, bankHolderMemberId: 'amit' });
  for (const m of ['amit', 'rohit', 'priya', 'kunal', 'sana']) {
    add('PLAYER_JOINED', { stintId: m, memberId: m });
    add('BUY_IN', { stintId: m, amount: 500 });
  }
  add('SHORT_TAKEN', { stintId: 'rohit', amount: 300 });
  add('TOP_UP', { stintId: 'kunal', amount: 500 });
  add('SHORT_REPAID', { stintId: 'rohit', amount: 200, method: 'cash' });
  add('PLAYER_LEFT', { stintId: 'sana', finalChips: 900, settledNow: 900 });
  add('PLAYER_JOINED', { stintId: 'sana2', memberId: 'sana' });
  add('BUY_IN', { stintId: 'sana2', amount: 500 });
  add('SHORT_TAKEN', { stintId: 'priya', amount: 200 });
  add('COUNTING_STARTED', {});
  for (const [s, c] of [['amit', 300], ['rohit', 1200], ['priya', 0], ['kunal', 1000], ['sana2', 600]] as const)
    add('FINAL_COUNT', { stintId: s, finalChips: c });
  return state;
}

const names: Record<string, string> = { amit: 'Amit', rohit: 'Rohit', priya: 'Priya', kunal: 'Kunal', sana: 'Sana' };

describe('WhatsApp share text (§8.10)', () => {
  it('matches the PRD format for the golden night', () => {
    const text = shareText({
      title: 'Diwali Night',
      state: golden(),
      nameOf: (id) => names[id]!,
      startedAt: '2026-11-08T14:00:00Z',
      endedAt: '2026-11-08T18:12:00Z',
      viewUrl: 'https://hisaab.app/v/abc',
    });
    expect(text).toBe(
      [
        '🪔 Hisaab · Diwali Night · 8 Nov',
        'Buy-in ₹500 · 5 players · 4h 12m',
        '',
        'Results',
        'Sana +₹500',
        'Rohit +₹400',
        'Kunal ₹0',
        'Amit −₹200',
        'Priya −₹700',
        '',
        'Who pays whom',
        'Amit → Rohit ₹1,100',
        'Amit → Kunal ₹1,000',
        'Amit → Sana ₹400',
        'Priya → Sana ₹200',
        '',
        'Full log: https://hisaab.app/v/abc',
      ].join('\n'),
    );
  });
});
