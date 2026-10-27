/** One member's result for one verified night (§8.14), from `session_results`. */
export interface ResultRow {
  sessionId: string;
  memberId: string;
  pnl: number;
  startedAt: string;
  title: string;
  groupId: string;
}

export interface LeaderRow {
  memberId: string;
  net: number;
  nights: number;
  won: number;
  best: number;
  /** Consecutive most recent nights with P&L > 0. */
  streak: number;
}

const byDate = (a: ResultRow, b: ResultRow) => a.startedAt.localeCompare(b.startedAt);

/** Calendar day in India, so a 1 AM finish still counts for the night it started. */
export function istDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function inRange<T extends { startedAt: string }>(rows: T[], range: { start?: string; end?: string }): T[] {
  return rows.filter((r) => {
    const d = istDay(r.startedAt);
    return (!range.start || d >= range.start) && (!range.end || d <= range.end);
  });
}

export function leaderboard(rows: ResultRow[]): LeaderRow[] {
  const by = Map.groupBy([...rows].sort(byDate), (r) => r.memberId);
  return [...by]
    .map(([memberId, rs]) => {
      let streak = 0;
      for (let i = rs.length - 1; i >= 0 && rs[i]!.pnl > 0; i--) streak++;
      return {
        memberId,
        net: rs.reduce((s, r) => s + r.pnl, 0),
        nights: rs.length,
        won: rs.filter((r) => r.pnl > 0).length,
        best: Math.max(...rs.map((r) => r.pnl)),
        streak,
      };
    })
    .sort((a, b) => b.net - a.net);
}

export function personalStats(rows: ResultRow[]) {
  const sorted = [...rows].sort(byDate);
  let net = 0;
  const running = sorted.map((r) => ({ date: r.startedAt, net: (net += r.pnl) }));
  const best = sorted.reduce<ResultRow | null>((b, r) => (!b || r.pnl > b.pnl ? r : b), null);
  const worst = sorted.reduce<ResultRow | null>((w, r) => (!w || r.pnl < w.pnl ? r : w), null);
  return {
    nights: sorted.length,
    winRate: sorted.length ? sorted.filter((r) => r.pnl > 0).length / sorted.length : 0,
    net,
    best,
    worst,
    running,
  };
}
