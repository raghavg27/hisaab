'use client';
import type { MemberResult, Transfer } from '@hisaab/ledger';
import { formatINR, formatSigned } from '@hisaab/ui';
import { toBlob } from 'html-to-image';
import { forwardRef } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { APP_NAME } from '@/lib/config';

/** 1080-wide share card rendered client-side (works offline). */
export const ShareCard = forwardRef<
  HTMLDivElement,
  { title: string; startedAt: string; results: MemberResult[]; transfers: Transfer[]; nameOf: (id: string) => string; buyIn: number }
>(function ShareCard({ title, startedAt, results, transfers, nameOf, buyIn }, ref) {
  return (
    <div ref={ref} className="rangoli w-[540px] bg-bg p-10 text-text" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="flex items-center gap-3">
        <DiyaMark size={36} />
        <span className="font-mono text-[13px] uppercase tracking-[0.08em] text-gold">{APP_NAME}</span>
      </div>
      <h1 className="mt-6 font-serif text-[48px] leading-none">{title}</h1>
      <p className="mt-2 text-text-2">
        {new Date(startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · Buy-in {formatINR(buyIn)}
      </p>
      <ul className="mt-8 space-y-3">
        {results.map((r) => (
          <li key={r.memberId} className="flex items-baseline justify-between border-b border-hairline pb-3 text-[22px]">
            <span>
              {nameOf(r.memberId)} {r.titles.includes('raja') ? '👑' : ''}
              {r.adjusted ? ' ⚠' : ''}
            </span>
            <span className={`tnum font-semibold ${r.pnl > 0 ? 'text-win' : r.pnl < 0 ? 'text-loss' : 'text-text-2'}`}>{formatSigned(r.pnl)}</span>
          </li>
        ))}
      </ul>
      {transfers.length > 0 && (
        <>
          <p className="mt-8 font-mono text-[12px] uppercase tracking-[0.08em] text-gold">Who pays whom</p>
          <ul className="mt-3 space-y-2 text-[18px] text-text-2">
            {transfers.map((t) => (
              <li key={`${t.from}>${t.to}`} className="tnum">
                {nameOf(t.from)} → {nameOf(t.to)} <span className="text-text">{formatINR(t.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
});

export async function shareCardPng(node: HTMLElement, name: string): Promise<File> {
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#0A0705', cacheBust: true });
  if (!blob) throw new Error('Could not render the image');
  return new File([blob], name.replace(/[^\w .-]/g, '') || 'hisaab.png', { type: 'image/png' });
}
