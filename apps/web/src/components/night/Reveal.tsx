'use client';
import type { MemberResult } from '@hisaab/ledger';
import { Avatar, cn, formatSigned } from '@hisaab/ui';
import gsap from 'gsap';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { prefersReducedMotion, liteVisuals } from '@/lib/prefs';

const Sparks = dynamic(() => import('@/components/three/Sparks').then((m) => m.Sparks), { ssr: false });
const SparksLite = dynamic(() => import('@/components/three/SparksLite').then((m) => m.SparksLite), { ssr: false });

/**
 * Settlement reveal (§11.5), ≤ 3.5 s, tap to skip: dim → diyas light left to right →
 * results count up (80 ms stagger) → flame-edge glow on the top winner → spark burst.
 */
export function Reveal({
  results,
  nameOf,
  colorOf,
  onDone,
}: {
  results: MemberResult[];
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
  onDone: () => void;
}) {
  const t = useTranslations('settle');
  const root = useRef<HTMLDivElement>(null);
  const [burst, setBurst] = useState(false);
  const [lite] = useState(() => liteVisuals());
  const top = results[0] && results[0].pnl > 0 ? results[0] : null;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      const h = setTimeout(onDone, 1200);
      return () => clearTimeout(h);
    }
    const ctx = gsap.context(() => {
      const nums = gsap.utils.toArray<HTMLElement>('[data-amount]');
      const tl = gsap.timeline({ onComplete: onDone });
      tl.fromTo(el, { backgroundColor: 'rgba(10,7,5,0)' }, { backgroundColor: 'rgba(10,7,5,0.96)', duration: 0.3 })
        .fromTo('[data-diya]', { opacity: 0.15, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.25, stagger: 0.8 / 5, ease: 'back.out(2)' })
        .fromTo('[data-row]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.08 }, '-=0.1');
      nums.forEach((n, i) => {
        const target = Number(n.dataset.amount);
        const o = { v: 0 };
        tl.to(o, { v: target, duration: 0.9, ease: 'power2.out', onUpdate: () => (n.textContent = formatSigned(Math.round(o.v))) }, 0.9 + i * 0.08);
      });
      tl.to('[data-top]', { boxShadow: '0 0 0 1px rgba(255,184,41,.6), 0 0 32px rgba(255,184,41,.45)', duration: 0.4 }, '>-0.2')
        .call(() => setBurst(true))
        .to({}, { duration: 1.0 })
        .to(el, { opacity: 0, duration: 0.3 });
    }, el);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={root}
      role="dialog"
      aria-label={t('title')}
      onClick={onDone}
      className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center px-6"
      style={{ backgroundColor: 'rgba(10,7,5,0.96)' }}
    >
      <div className="mb-8 flex gap-4" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} data-diya>
            <DiyaMark size={36} />
          </span>
        ))}
      </div>
      <ul className="w-full max-w-[400px] space-y-2">
        {results.slice(0, 8).map((r) => (
          <li
            key={r.memberId}
            data-row
            {...(r === top ? { 'data-top': '' } : {})}
            className="flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] bg-surface-1 px-3"
          >
            <Avatar name={nameOf(r.memberId)} color={colorOf(r.memberId)} size={32} />
            <span className="flex-1 truncate">{nameOf(r.memberId)}</span>
            <span data-amount={r.pnl} className={cn('tnum text-title font-semibold', r.pnl > 0 && 'text-win', r.pnl < 0 && 'text-loss')}>
              {formatSigned(r.pnl)}
            </span>
          </li>
        ))}
      </ul>
      {top && <p className="mt-6 font-serif text-[32px]">👑 {nameOf(top.memberId)}</p>}
      <p className="absolute bottom-[max(24px,env(safe-area-inset-bottom))] text-caption text-text-3">{t('skip')}</p>
      {burst && top && (lite ? <SparksLite /> : <Sparks />)}
    </div>
  );
}
