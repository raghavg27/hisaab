import { describe, expect, it } from 'vitest';
import { inRange, leaderboard, personalStats, type ResultRow } from '@/lib/stats';

const row = (memberId: string, pnl: number, startedAt: string, sessionId = startedAt): ResultRow => ({
  sessionId,
  memberId,
  pnl,
  startedAt,
  title: 'Night',
  groupId: 'g',
});

const rows: ResultRow[] = [
  row('amit', 300, '2026-10-01T15:00:00Z'),
  row('rohit', -300, '2026-10-01T15:00:00Z'),
  row('amit', -200, '2026-10-08T15:00:00Z'),
  row('rohit', 200, '2026-10-08T15:00:00Z'),
  row('amit', 500, '2026-10-15T15:00:00Z'),
  row('rohit', -500, '2026-10-15T15:00:00Z'),
  row('amit', 100, '2026-10-22T15:00:00Z'),
  row('rohit', -100, '2026-10-22T15:00:00Z'),
];

describe('leaderboard', () => {
  it('totals net, nights, wins, best night and current streak, ranked by net', () => {
    expect(leaderboard(rows)).toEqual([
      { memberId: 'amit', net: 700, nights: 4, won: 3, best: 500, streak: 2 },
      { memberId: 'rohit', net: -700, nights: 4, won: 1, best: 200, streak: 0 },
    ]);
  });

  it('a break-even night ends a streak and is not a win', () => {
    const lb = leaderboard([...rows, row('amit', 0, '2026-10-29T15:00:00Z')]);
    expect(lb[0]).toMatchObject({ won: 3, streak: 0, nights: 5 });
  });
});

describe('inRange', () => {
  it('keeps nights whose start falls inside the inclusive date range (IST days)', () => {
    // 2026-10-08 20:30 IST and 2026-10-15 20:30 IST
    expect(inRange(rows, { start: '2026-10-08', end: '2026-10-15' }).map((r) => r.startedAt)).toEqual([
      '2026-10-08T15:00:00Z',
      '2026-10-08T15:00:00Z',
      '2026-10-15T15:00:00Z',
      '2026-10-15T15:00:00Z',
    ]);
  });

  it('a night after 18:30 UTC belongs to the next IST day', () => {
    expect(inRange([row('a', 1, '2026-10-31T19:00:00Z')], { start: '2026-11-01', end: '2026-11-01' })).toHaveLength(1);
  });

  it('open ends are unbounded', () => {
    expect(inRange(rows, {})).toHaveLength(8);
  });
});

describe('personalStats', () => {
  it('nights, win rate, best and worst, and a running net in date order', () => {
    const mine = rows.filter((r) => r.memberId === 'amit').reverse();
    const s = personalStats(mine);
    expect(s.nights).toBe(4);
    expect(s.winRate).toBe(0.75);
    expect(s.best?.pnl).toBe(500);
    expect(s.worst?.pnl).toBe(-200);
    expect(s.running.map((p) => p.net)).toEqual([300, 100, 600, 700]);
  });

  it('is empty without nights', () => {
    expect(personalStats([])).toEqual({ nights: 0, winRate: 0, net: 0, best: null, worst: null, running: [] });
  });
});
