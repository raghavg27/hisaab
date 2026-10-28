import { nightResults, settlement, type NightState } from '@hisaab/ledger';
import { formatINR, formatSigned } from '@hisaab/ui';
import { APP_NAME } from './config';

export function durationText(startedAt: string, endedAt: string | null) {
  const ms = Math.max(0, new Date(endedAt ?? Date.now()).getTime() - new Date(startedAt).getTime());
  const m = Math.floor(ms / 60_000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** What the kitty holder actually collected (§8.11), and who hasn't paid yet. */
export function kittyStatus(state: NightState) {
  const kitty = state.config?.kitty;
  if (!kitty) return null;
  const people = [...new Set(state.stints.map((s) => s.memberId))];
  const unpaid = people.filter((m) => !state.kittyPaid[m]);
  return { collected: kitty.amount * (people.length - unpaid.length), holderMemberId: kitty.holderMemberId, unpaid };
}

/** WhatsApp share text (§8.10). Requires a settleable night. */
export function shareText(opts: {
  title: string;
  state: NightState;
  nameOf: (memberId: string) => string;
  startedAt: string;
  endedAt: string | null;
  viewUrl: string | null;
}): string {
  const { state, nameOf } = opts;
  const results = nightResults(state, nameOf);
  const { transfers } = settlement(state, nameOf);
  const date = new Date(opts.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  const lines = [
    `🪔 ${APP_NAME} · ${opts.title} · ${date}`,
    `Buy-in ${formatINR(state.config!.buyIn)} · ${results.length} players · ${durationText(opts.startedAt, opts.endedAt)}`,
    '',
    'Results',
    ...results.map((r) => `${nameOf(r.memberId)} ${formatSigned(r.pnl)}${r.adjusted ? ' ⚠' : ''}`),
    '',
    'Who pays whom',
    ...(transfers.length ? transfers.map((t) => `${nameOf(t.from)} → ${nameOf(t.to)} ${formatINR(t.amount)}`) : ['All square']),
  ];
  const kitty = kittyStatus(state);
  if (kitty) {
    const unpaid = kitty.unpaid.length ? ` · not paid: ${kitty.unpaid.map(nameOf).join(', ')}` : '';
    lines.push('', `Kitty ${formatINR(kitty.collected)} with ${nameOf(kitty.holderMemberId)}${unpaid}`);
  }
  if (opts.viewUrl) lines.push('', `Full log: ${opts.viewUrl}`);
  return lines.join('\n');
}
