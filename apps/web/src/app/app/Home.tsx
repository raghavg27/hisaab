'use client';
import { Button, Eyebrow, formatINR } from '@hisaab/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { DiyaMark } from '@/components/DiyaMark';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createGroup, dateTitle } from '@/lib/groups';
import { useGo } from '@/lib/nav';

export function Home() {
  const t = useTranslations('home');
  const { profile, userId } = useAuth();
  const go = useGo();
  const groups = useLiveQuery(() => db.groups.filter((g) => !g.deletedAt).toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(20).toArray(), []);
  if (!groups || !sessions) return null;
  const live = sessions.filter((s) => s.status === 'live' || s.status === 'counting' || s.status === 'settling');
  const recent = sessions.filter((s) => !live.includes(s)).slice(0, 8);
  const groupOf = (id: string) => groups.find((g) => g.id === id);

  async function quickStart() {
    const g = await createGroup({ name: dateTitle() });
    go(`/app/new?group=${g.id}`);
  }

  return (
    <main className="px-4 pt-6">
      <header className="mb-6 flex items-center gap-2">
        <DiyaMark size={24} />
        <Eyebrow>{t('greeting', { name: profile?.displayName ?? '' })}</Eyebrow>
      </header>

      {live.map((s) => (
        <Link
          key={s.id}
          href={`/app/s?id=${s.id}`}
          className="mb-3 flex items-center gap-3 rounded-[var(--radius-card)] border border-flame/40 bg-surface-1 p-4 shadow-[var(--glow-flame)]"
        >
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <StatusBadge status={s.status} />
              <span className="text-caption text-text-3">{s.hostUserId === userId ? '' : t('resumeViewer')}</span>
            </div>
            <p className="truncate text-body font-semibold">{s.title}</p>
            <p className="text-caption text-text-2">
              {groupOf(s.groupId)?.emoji} {groupOf(s.groupId)?.name} · {formatINR(s.config.buyIn)}
            </p>
          </div>
          <span className="text-label text-flame">{t('resume')}</span>
          <ChevronRight size={20} strokeWidth={1.5} className="text-flame" aria-hidden />
        </Link>
      ))}

      <div className="mb-8 grid gap-2">
        <Button variant={live.length ? 'surface' : 'primary'} size="lg" onClick={() => go('/app/new')}>
          <Plus size={20} strokeWidth={1.5} aria-hidden /> {t('newNight')}
        </Button>
        <Button variant="ghost" size="md" onClick={quickStart} aria-describedby="qs-hint">
          <Zap size={18} strokeWidth={1.5} aria-hidden /> {t('quickStart')}
        </Button>
        <p id="qs-hint" className="text-center text-caption text-text-3">
          {t('quickStartHint')}
        </p>
      </div>

      {groups.length === 0 && sessions.length === 0 ? (
        <section className="rangoli rounded-[var(--radius-card)] border border-hairline p-6 text-center">
          <p className="font-serif text-[28px] leading-tight">{t('emptyTitle')}</p>
          <p className="mt-2 text-text-2">{t('emptyBody')}</p>
        </section>
      ) : (
        <>
          {groups.length > 0 && (
            <section className="mb-8">
              <Eyebrow className="mb-3">{t('yourGroups')}</Eyebrow>
              <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link href={`/app/g?id=${g.id}`} className="flex min-h-14 items-center gap-3 px-4">
                      <span className="text-[20px]" aria-hidden>
                        {g.emoji}
                      </span>
                      <span className="flex-1 truncate">{g.name}</span>
                      <ChevronRight size={18} strokeWidth={1.5} className="text-text-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <Eyebrow className="mb-3">{t('recent')}</Eyebrow>
            {recent.length === 0 ? (
              <p className="text-text-3">{t('noNights')}</p>
            ) : (
              <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
                {recent.map((s) => (
                  <li key={s.id}>
                    <Link href={`/app/s/settle?id=${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{s.title}</p>
                        <p className="text-caption text-text-3">
                          {groupOf(s.groupId)?.name} ·{' '}
                          {new Date(s.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <StatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
