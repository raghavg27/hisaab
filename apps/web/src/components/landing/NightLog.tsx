'use client';
import { Avatar, cn, formatINR } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { clockText, runClock, useMotion } from './useMotion';

const START = 21 * 60;
// minutes after midnight, so 1:12 am is 24 * 60 + 72
const NIGHT = [
  { at: START + 4, key: 'SESSION_STARTED', v: { amount: 500 } },
  { at: START + 9, key: 'BUY_IN', v: { name: 'Rohit', amount: 500 }, who: ['Rohit', 'peacock'] },
  { at: START + 78, key: 'TOP_UP', v: { name: 'Neha', amount: 500 }, who: ['Neha', 'rani'] },
  {
    at: START + 122,
    key: 'SHORT_TAKEN',
    v: { name: 'Rohit', amount: 300 },
    who: ['Rohit', 'peacock'],
    short: true,
  },
  {
    at: START + 167,
    key: 'SHORT_REPAID_chips',
    v: { name: 'Rohit', amount: 200 },
    who: ['Rohit', 'peacock'],
  },
  {
    at: START + 210,
    key: 'PLAYER_LEFT',
    v: { name: 'Priya', chips: 1150, amount: 650 },
    who: ['Priya', 'mint'],
  },
  { at: START + 252, key: 'COUNTING_STARTED', v: {} },
] as const;
export const NIGHT_END = NIGHT.at(-1)!.at;

const money = (v: Record<string, string | number>) =>
  Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'number' ? formatINR(x) : x]));

/** Scene 1: the log writes itself while the header clock runs from 9 pm to counting time. */
export function NightLog() {
  const t = useTranslations('landing');
  const tlog = useTranslations('log');
  const tsync = useTranslations('sync');
  const root = useRef<HTMLElement>(null);

  useMotion(root, ({ gsap }) => {
    const rows = gsap.utils.toArray<HTMLElement>('[data-entry]');
    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      scrollTrigger: {
        trigger: root.current,
        start: 'top top',
        end: '+=180%',
        pin: true,
        scrub: 0.6,
        onUpdate: runClock(START, NIGHT_END + 6),
      },
    });
    // newest first, like the real log: each entry opens space at the top
    rows.forEach((row, i) => {
      const at = NIGHT[NIGHT.length - 1 - i]!.at - START;
      tl.from(row, { height: 0, autoAlpha: 0, y: -16, duration: 10 }, at);
    });
  });

  return (
    <section ref={root} aria-labelledby="log-title" className="flex min-h-svh items-center pt-20 pb-10">
      <div className="mx-auto grid w-full max-w-[1180px] items-center gap-10 px-4 md:grid-cols-[1fr_440px] md:gap-16 md:px-8">
        <div className="max-w-[30rem]">
          <h2 id="log-title" className="font-serif text-[clamp(40px,7vw,76px)] leading-[0.95]">
            {t('f1t')}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-text-2">{t('f1b')}</p>
          <p className="mt-8 border-l border-flame/50 pl-4 text-text-2">
            <span className="block font-semibold text-text">{t('f2t')}</span>
            {t('f2b')}
          </p>
        </div>
        <figure className="rounded-[var(--radius-sheet)] bg-surface-1 p-4 shadow-[var(--key)]">
          <figcaption className="flex items-center justify-between border-b border-hairline pb-3">
            <span className="font-semibold">{tlog('title')}</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-win/30 px-2.5 text-caption text-win">
              <span aria-hidden>●</span>
              {tsync('live')} · {t('watching', { count: 3 })}
            </span>
          </figcaption>
          <ol className="h-[392px] overflow-hidden">
            {[...NIGHT].reverse().map((e) => (
              <li key={e.at} data-entry className="overflow-hidden">
                <div className="flex items-start gap-3 border-b border-hairline py-3">
                  <span className="tnum w-16 shrink-0 pt-0.5 text-caption text-text-3">
                    {clockText(e.at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('short' in e && 'text-short')}>{tlog(`e.${e.key}`, money(e.v))}</p>
                    <p className="text-caption text-text-3">{tlog('by', { name: 'Amit' })}</p>
                  </div>
                  {'who' in e && <Avatar name={e.who[0]} color={e.who[1]} size={28} />}
                </div>
              </li>
            ))}
          </ol>
        </figure>
      </div>
    </section>
  );
}
