import { useTranslations } from 'next-intl';
import type { SessionStatus } from '@/lib/db';
import { cn } from '@hisaab/ui';

export function StatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('home');
  const label =
    status === 'live' ? t('live') : status === 'counting' || status === 'settling' ? t('counting') : status === 'needs_review' ? t('needsReview') : t('closed');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em]',
        status === 'live' ? 'border-flame/40 text-flame' : status === 'needs_review' ? 'border-loss/40 text-loss' : 'border-hairline-strong text-text-2',
      )}
    >
      {status === 'live' && <span className="size-1.5 rounded-full bg-flame" aria-hidden />}
      {label}
    </span>
  );
}
