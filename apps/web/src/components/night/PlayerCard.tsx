'use client';
import { derive, type StintState } from '@hisaab/ledger';
import { AmountText, Avatar, cn, formatINR, rupeesLabel } from '@hisaab/ui';
import { Crown, Landmark, MoreHorizontal } from 'lucide-react';
import { Plus } from '@/components/AnimatedIcon';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { LocalMember } from '@/lib/db';

export function PlayerCard({
  stint,
  member,
  isBank,
  isHost,
  canAct,
  onTopUp,
  onShort,
  onMore,
}: {
  stint: StintState;
  member: LocalMember | undefined;
  isBank: boolean;
  isHost: boolean;
  canAct: boolean;
  onTopUp: () => void;
  onShort: () => void;
  onMore: () => void;
}) {
  const t = useTranslations('live');
  const d = derive(stint);
  const name = member?.nickname ?? '?';
  return (
    <motion.li
      layout
      transition={{ duration: 0.18 }}
      className="rounded-[var(--radius-card)] bg-surface-1 p-3 shadow-[var(--key)]"
      aria-label={`${name}, ${t('in', { amount: rupeesLabel(d.netChips) })}${d.shortOutstanding > 0 ? `, ${t('short', { amount: rupeesLabel(d.shortOutstanding) })}` : ''}`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={name} color={member?.color ?? 'sand'} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate font-semibold">
            {name}
            {isBank && (
              <span title={t('bankTag')} className="text-gold">
                <Landmark size={14} strokeWidth={1.5} aria-label={t('bankTag')} />
              </span>
            )}
            {isHost && (
              <span title={t('hostTag')} className="text-gold">
                <Crown size={14} strokeWidth={1.5} aria-label={t('hostTag')} />
              </span>
            )}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-label text-text-2" aria-hidden>
            <span>
              {t('inPrefix')} <AmountText value={d.netChips} />
            </span>
            {d.shortOutstanding > 0 && (
              <span className="rounded-full border border-short/40 px-2 text-caption text-short">
                {t('short', { amount: formatINR(d.shortOutstanding) })}
              </span>
            )}
          </p>
        </div>
      </div>
      {canAct && (
        <div className="mt-3 grid grid-cols-[1fr_1fr_48px] gap-2">
          <button
            type="button"
            onClick={onTopUp}
            className="flex min-h-12 items-center justify-center gap-1 rounded-[var(--radius-btn)] bg-surface-2 text-label font-medium shadow-[var(--key)] active:scale-[0.97] active:shadow-[var(--key-pressed)]"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden /> {t('topUp')}
          </button>
          <button
            type="button"
            onClick={onShort}
            className={cn(
              'min-h-12 rounded-[var(--radius-btn)] border border-short/40 text-label font-medium text-short active:scale-[0.97] active:bg-surface-2',
            )}
          >
            {t('shortCta')}
          </button>
          <button
            type="button"
            onClick={onMore}
            aria-label={`${t('more')}: ${name}`}
            className="flex min-h-12 items-center justify-center rounded-[var(--radius-btn)] text-text-2 active:bg-surface-2"
          >
            <MoreHorizontal size={20} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </motion.li>
  );
}
