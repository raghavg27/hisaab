'use client';
import { useTranslations } from 'next-intl';
import { DiyaMark } from './DiyaMark';

/** Static placeholder while auth/local data loads. */
export function Loading() {
  const t = useTranslations('common');
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label={t('loading')}>
      <DiyaMark size={40} className="animate-pulse" />
    </div>
  );
}
