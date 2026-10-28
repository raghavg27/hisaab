'use client';
import { useTranslations } from 'next-intl';
import { useSync } from '@/lib/sync';
import { cn } from '@hisaab/ui';

/** ● Live / ◌ Offline · 3 to sync / ⟳ Syncing / ⚠ Sync failed (§8.4). */
export function SyncPill({ unsynced }: { unsynced: number }) {
  const t = useTranslations('sync');
  const { online, syncing, error } = useSync();
  // The outbox retries every 10 s; say so when it keeps failing instead of spinning on "Syncing".
  const state = !online ? 'offline' : error && unsynced > 0 ? 'failed' : syncing || unsynced > 0 ? 'syncing' : 'live';
  return (
    <span
      role="status"
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption whitespace-nowrap',
        state === 'live' && 'border-win/30 text-win',
        state === 'offline' && 'border-hairline-strong text-text-2',
        state === 'syncing' && 'border-flame/40 text-flame',
        state === 'failed' && 'border-loss/40 text-loss',
      )}
    >
      <span aria-hidden>{state === 'live' ? '●' : state === 'offline' ? '◌' : state === 'failed' ? '⚠' : '⟳'}</span>
      {state === 'live'
        ? t('live')
        : state === 'offline'
          ? t('offline', { count: unsynced })
          : state === 'failed'
            ? t('failed', { count: unsynced })
            : t('syncing')}
    </span>
  );
}
