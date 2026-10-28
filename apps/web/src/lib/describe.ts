import type { LedgerEvent } from '@hisaab/ledger';
import { formatINR } from '@hisaab/ui';
import type { useTranslations } from 'next-intl';
import type { Night } from './night';

type T = ReturnType<typeof useTranslations<'log'>>;

/** One log line as a sentence: "Rohit took a short · ₹300". */
export function describeEvent(t: T, e: LedgerEvent, night: Pick<Night, 'state' | 'nameOf' | 'members'>): string {
  const stintName = (stintId: string) => {
    const s = night.state.stints.find((x) => x.id === stintId);
    if (s) return night.nameOf(s.memberId);
    // Voided joins aren't in the projection; find the member from the log.
    const join = night.state.log.find((l) => l.event.type === 'PLAYER_JOINED' && l.event.payload.stintId === stintId);
    return join?.event.type === 'PLAYER_JOINED' ? night.nameOf(join.event.payload.memberId) : '?';
  };
  const userName = (userId: string) => night.members.find((m) => m.userId === userId)?.nickname ?? '?';
  switch (e.type) {
    case 'SESSION_STARTED':
      return t('e.SESSION_STARTED', { amount: formatINR(e.payload.buyIn) });
    case 'PLAYER_JOINED':
      return t('e.PLAYER_JOINED', { name: night.nameOf(e.payload.memberId) });
    case 'BUY_IN':
    case 'TOP_UP':
    case 'SHORT_TAKEN':
      return t(`e.${e.type}`, { name: stintName(e.payload.stintId), amount: formatINR(e.payload.amount) });
    case 'SHORT_REPAID':
      return t(`e.SHORT_REPAID_${e.payload.method}`, { name: stintName(e.payload.stintId), amount: formatINR(e.payload.amount) });
    case 'PLAYER_LEFT': {
      const settled = e.payload.settledNow;
      return t('e.PLAYER_LEFT', {
        name: stintName(e.payload.stintId),
        chips: formatINR(e.payload.finalChips),
        amount: formatINR(Math.abs(settled)),
        paid: settled > 0 ? 'bank' : settled < 0 ? 'player' : 'none',
      });
    }
    case 'FINAL_COUNT':
      return t('e.FINAL_COUNT', { name: stintName(e.payload.stintId), amount: formatINR(e.payload.finalChips) });
    case 'ADJUSTMENT':
      return t('e.ADJUSTMENT', { name: stintName(e.payload.stintId), amount: formatINR(e.payload.amount) });
    case 'BANK_CHECK':
      return t('e.BANK_CHECK', { counted: formatINR(e.payload.counted), expected: formatINR(e.payload.expected) });
    case 'BANK_TRANSFERRED':
      return t('e.BANK_TRANSFERRED', {
        name: night.nameOf(e.payload.toMemberId),
        counted: formatINR(e.payload.counted),
        expected: formatINR(e.payload.expected),
      });
    case 'HOST_TRANSFERRED':
      return t(e.payload.forced ? 'e.HOST_TRANSFERRED_forced' : 'e.HOST_TRANSFERRED', { name: userName(e.payload.toUserId) });
    case 'TRANSFER_MARKED':
      return t('e.TRANSFER_MARKED', {
        from: night.nameOf(e.payload.from),
        to: night.nameOf(e.payload.to),
        amount: formatINR(e.payload.amount),
        paid: String(e.payload.paid),
      });
    case 'KITTY_MARKED':
      return t('e.KITTY_MARKED', { name: night.nameOf(e.payload.memberId), paid: String(e.payload.paid) });
    case 'SESSION_REOPENED':
      return t('e.SESSION_REOPENED', { reason: e.payload.reason });
    case 'EVENT_VOIDED':
      return t('e.EVENT_VOIDED', { reason: t(`reasons.${e.payload.reason}`) });
    case 'COUNTING_STARTED':
    case 'COUNTING_REOPENED':
    case 'SESSION_CLOSED':
      return t(`e.${e.type}`);
  }
}
