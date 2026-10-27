'use client';
import { Eyebrow, cn, formatINR, formatSigned } from '@hisaab/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { useResults } from '@/lib/results';
import { personalStats } from '@/lib/stats';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function History() {
  const t = useTranslations('history');
  const tc = useTranslations('common');
  const userId = useAuth((s) => s.userId);
  const mine = useLiveQuery(async () => (userId ? db.members.where('userId').equals(userId).toArray() : []), [userId]);
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const results = useResults({ memberIds: mine?.map((m) => m.id) ?? [] });
  if (!mine || !groups) return null;
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <main className="px-4 pt-6">
      <h1 className="mb-6 font-serif text-[28px]">{t('title')}</h1>
      {!mine.length ? (
        <p className="text-text-3">{t('claimHint')}</p>
      ) : results.isPending ? (
        <p className="text-text-3">{tc('loading')}</p>
      ) : results.isError ? (
        <p className="text-text-3">{navigator.onLine ? results.error.message : tc('offline')}</p>
      ) : (
        <Stats rows={results.data} groupName={groupName} />
      )}
    </main>
  );
}

function Stats({ rows, groupName }: { rows: Parameters<typeof personalStats>[0]; groupName: (id: string) => string }) {
  const t = useTranslations('history');
  const th = useTranslations('home');
  const s = personalStats(rows);
  if (!s.nights) return <p className="text-text-3">{th('noNights')}</p>;
  const newest = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <>
      <Eyebrow className="mb-3">{t('me')}</Eyebrow>
      <dl className="mb-6 grid grid-cols-2 gap-2">
        <Tile label={t('nightsPlayed')} value={String(s.nights)} />
        <Tile label={t('winRate')} value={`${Math.round(s.winRate * 100)}%`} />
        <Tile label={t('best')} value={formatSigned(s.best!.pnl)} sub={day(s.best!.startedAt)} />
        <Tile label={t('worst')} value={formatSigned(s.worst!.pnl)} sub={day(s.worst!.startedAt)} />
      </dl>

      <section className="mb-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-label text-text-2">{t('net')}</h2>
          <span className={cn('tnum text-body font-semibold', s.net > 0 && 'text-win', s.net < 0 && 'text-loss')}>{formatSigned(s.net)}</span>
        </div>
        <NetChart points={s.running} />
      </section>

      <Eyebrow className="mb-3">{t('allNights')}</Eyebrow>
      <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
        {newest.map((r) => (
          <li key={r.sessionId}>
            <Link href={`/app/s/settle?id=${r.sessionId}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.title}</span>
                <span className="block text-caption text-text-3">
                  {groupName(r.groupId)} · {day(r.startedAt)}
                </span>
              </span>
              <span className={cn('tnum', r.pnl > 0 && 'text-win', r.pnl < 0 && 'text-loss')}>{formatSigned(r.pnl)}</span>
              <ChevronRight size={18} strokeWidth={1.5} className="text-text-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface-1 p-3">
      <dt className="text-caption text-text-3">{label}</dt>
      <dd className="tnum text-[22px] font-semibold">{value}</dd>
      {sub && <dd className="text-caption text-text-3">{sub}</dd>}
    </div>
  );
}

const W = 320;
const H = 140;
const PAD = 8;

/** Running net, one 2px line with a zero baseline. Tap or hover for the value at a night. */
function NetChart({ points }: { points: { date: string; net: number }[] }) {
  const t = useTranslations('history');
  const [hover, setHover] = useState<number | null>(null);
  const values = [0, ...points.map((p) => p.net)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (points.length - 1));
  const y = (v: number) => PAD + ((max - v) * (H - 2 * PAD)) / span;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join('');
  const last = points.at(-1)!;
  const h = hover === null ? null : points[hover]!;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  return (
    <figure className="relative rounded-[var(--radius-card)] bg-surface-1 p-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full touch-none"
        role="img"
        aria-label={t('chartLabel', { net: formatSigned(last.net), count: points.length })}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--hairline-strong)" strokeWidth={1} strokeDasharray="3 3" />
        <path d={d} fill="none" stroke="var(--flame)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {h && (
          <>
            <line x1={x(hover!)} x2={x(hover!)} y1={0} y2={H} stroke="var(--hairline-strong)" strokeWidth={1} />
            <circle cx={x(hover!)} cy={y(h.net)} r={4} fill="var(--flame)" stroke="var(--surface-1)" strokeWidth={2} />
          </>
        )}
        {!h && <circle cx={x(points.length - 1)} cy={y(last.net)} r={4} fill="var(--flame)" stroke="var(--surface-1)" strokeWidth={2} />}
      </svg>
      <figcaption className="tnum flex justify-between px-1 text-caption text-text-3" aria-live="polite">
        {h ? (
          <>
            <span>{day(h.date)}</span>
            <span className="text-text">{formatSigned(h.net)}</span>
          </>
        ) : (
          <>
            <span>{day(points[0]!.date)}</span>
            <span>{formatINR(0)} ┄</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
