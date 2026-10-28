'use client';
import { Avatar, formatINR } from '@hisaab/ui';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { runClock, useMotion } from './useMotion';
import { NIGHT_END } from './NightLog';

const EXPECTED = 6000;
const COUNTS = [
  { name: 'Amit', color: 'marigold', chips: 1700 },
  { name: 'Rohit', color: 'peacock', chips: 400 },
  { name: 'Neha', color: 'rani', chips: 700 },
  { name: 'Kabir', color: 'sky', chips: 1900 },
  { name: 'Sameer', color: 'lilac', chips: 1000, recount: 1300 },
];
const FIRST = COUNTS.reduce((a, c) => a + c.chips, 0);
const FINAL = COUNTS.reduce((a, c) => a + (c.recount ?? c.chips), 0);
export const COUNT_END = NIGHT_END + 22;

/** Scene 2: chips get counted, the table comes up ₹300 short, a recount closes the gap. */
export function CountCheck() {
  const t = useTranslations('landing');
  const tc = useTranslations('count');
  const root = useRef<HTMLElement>(null);

  useMotion(
    root,
    ({ gsap }) => {
      const q = gsap.utils.selector(root);
      const total = q('[data-total]')[0]!;
      const sentence = q('[data-sentence]')[0]!;
      const cells = q('[data-amount]');
      const rows = q('[data-row]');
      const RECOUNT = COUNTS.length + 2.1; // beat where Sameer's recount starts
      const clamp = gsap.utils.clamp(0, 1);
      const tens = (n: number) => formatINR(Math.round(n / 10) * 10);
      // Every number is a function of timeline time, so scrubbing either way always lands right.
      const paint = (time: number) => {
        let sum = 0;
        COUNTS.forEach((c, i) => {
          const n = c.chips * clamp(time - i) + ((c.recount ?? c.chips) - c.chips) * clamp(time - RECOUNT);
          sum += n;
          cells[i]!.textContent = tens(n);
          // not yet counted: muted, not faded, so it stays readable
          rows[i]!.classList.toggle('text-text-3', n === 0);
        });
        total.textContent = tens(sum);
        sentence.textContent = tc('counted', { counted: tens(sum), expected: formatINR(EXPECTED) });
      };
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: () => paint(tl.time()),
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: '+=160%',
          pin: true,
          scrub: 0.6,
          onUpdate: runClock(NIGHT_END + 6, COUNT_END),
        },
      });
      paint(0);
      // one player per beat (painted above), then the gap, then the recount
      const at = RECOUNT - 0.3;
      const sameer = rows[COUNTS.length - 1]!;
      tl.from(
        q('[data-gap]'),
        { autoAlpha: 0, y: 12, duration: 0.8, ease: 'power2.out' },
        COUNTS.length + 0.2,
      )
        .from(q('[data-recount]'), { autoAlpha: 0, x: -8, duration: 0.5 }, at)
        .to(sameer, { backgroundColor: 'rgb(255 184 41 / 0.08)', duration: 0.4 }, at)
        .to(q('[data-gap]'), { autoAlpha: 0.4, duration: 0.5 }, at + 1.3)
        .from(q('[data-match]'), { autoAlpha: 0, y: 12, duration: 0.8, ease: 'power2.out' }, at + 1.3)
        .to(sameer, { backgroundColor: 'rgb(255 184 41 / 0)', duration: 0.6 }, at + 1.6)
        .to({}, { duration: 0.6 });
    },
    [tc],
  );

  return (
    <section ref={root} aria-labelledby="count-title" className="flex min-h-svh items-center pt-20 pb-10">
      <div className="mx-auto grid w-full max-w-[1180px] items-center gap-8 px-4 md:grid-cols-[1fr_440px] md:gap-16 md:px-8">
        <div className="max-w-[30rem]">
          <h2 id="count-title" className="font-serif text-[clamp(40px,7vw,76px)] leading-[0.95]">
            {t('f3t')}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-text-2">{t('f3b')}</p>
        </div>
        <figure className="rounded-[var(--radius-sheet)] bg-surface-1 p-4 shadow-[var(--key)]">
          <figcaption>
            <span className="block font-semibold">{tc('title')}</span>
            <span data-total className="tnum mt-1 block font-serif text-[clamp(56px,9vw,88px)] leading-none">
              {formatINR(FINAL)}
            </span>
            <span data-sentence className="tnum mt-1 block text-caption text-text-3">
              {tc('counted', { counted: formatINR(FINAL), expected: formatINR(EXPECTED) })}
            </span>
          </figcaption>
          <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
            {COUNTS.map((c) => (
              <li key={c.name} data-row className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2">
                <Avatar name={c.name} color={c.color} size={28} />
                <span className="flex-1">{c.name}</span>
                {c.recount && (
                  <span data-recount className="text-caption text-flame">
                    {tc('recount')}
                  </span>
                )}
                <span data-amount className="tnum w-20 text-right">
                  {formatINR(c.recount ?? c.chips)}
                </span>
              </li>
            ))}
          </ul>
          <div data-gap className="mt-3 text-label">
            <p className="flex items-center gap-1.5 font-semibold text-loss">
              <AlertTriangle size={16} strokeWidth={1.5} aria-hidden />
              {tc('missing', { amount: formatINR(EXPECTED - FIRST) })}
            </p>
            <p className="mt-0.5 text-text-3">{tc('missingCauses')}</p>
          </div>
          <p data-match className="mt-3 text-label font-semibold text-win">
            ✅ {tc('match', { amount: formatINR(FINAL) })}
          </p>
        </figure>
      </div>
    </section>
  );
}
