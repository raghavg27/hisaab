'use client';
import { Avatar, cn, colorHex, formatINR, formatSigned } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { COUNT_END } from './CountCheck';
import { runClock, useMotion } from './useMotion';

const PEOPLE = [
  { name: 'Amit', color: 'marigold', net: 700 },
  { name: 'Kabir', color: 'sky', net: 900 },
  { name: 'Sameer', color: 'lilac', net: -500 },
  { name: 'Neha', color: 'rani', net: -300 },
  { name: 'Rohit', color: 'peacock', net: -800 },
];
// the fewest transfers that settle the nets above; tag = where along the arrow its amount sits, so tags don't collide
const TRANSFERS = [
  { from: 4, to: 1, amount: 800, tag: 0.5 },
  { from: 2, to: 0, amount: 500, tag: 0.4 },
  { from: 3, to: 0, amount: 200, tag: 0.4 },
  { from: 3, to: 1, amount: 100, tag: 0.35 },
];
const C = 200;
const RING = 140;
const NODE = 30;
const at = (i: number) => {
  const a = (-90 + i * 72) * (Math.PI / 180);
  return { x: C + Math.cos(a) * RING, y: C + Math.sin(a) * RING };
};
/** Straight segment between two nodes, trimmed to their edges. */
function segment(a: number, b: number, gap = NODE + 6) {
  const p = at(a);
  const q = at(b);
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  const ux = (q.x - p.x) / d;
  const uy = (q.y - p.y) / d;
  return { x1: p.x + ux * gap, y1: p.y + uy * gap, x2: q.x - ux * gap, y2: q.y - uy * gap, ux, uy };
}
const PAIRS = PEOPLE.flatMap((_, a) => PEOPLE.map((_, b) => [a, b] as const).filter(([, b]) => b > a));

/** Scene 3: everyone-owes-everyone collapses into four payments. */
export function SettleGraph() {
  const t = useTranslations('landing');
  const ts = useTranslations('settle');
  const root = useRef<HTMLElement>(null);

  useMotion(root, ({ gsap }) => {
    const q = gsap.utils.selector(root);
    const tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: root.current,
        start: 'top top',
        end: '+=170%',
        pin: true,
        scrub: 0.6,
        onUpdate: runClock(COUNT_END, COUNT_END + 8),
      },
    });
    tl.from(
      q('[data-node]'),
      { scale: 0.6, autoAlpha: 0, transformOrigin: '50% 50%', stagger: 0.15, duration: 0.6 },
      0,
    )
      .from(q('[data-tangle]'), { drawSVG: 0, stagger: 0.12, duration: 1 }, 0.4)
      .to(q('[data-tangle]'), { autoAlpha: 0.12, duration: 0.8 }, 2.6)
      .addLabel('settle', 2.8);
    q('[data-pay]').forEach((pay, i) => {
      const s = 'settle+=' + i * 0.6;
      tl.from(pay.querySelector('line'), { drawSVG: 0, duration: 0.8 }, s)
        .from(pay.querySelectorAll('[data-head], [data-tag]'), { autoAlpha: 0, duration: 0.3 }, `${s}+=0.6`)
        .from(q('[data-row]')[i]!, { autoAlpha: 0, y: 10, duration: 0.5 }, `${s}+=0.4`);
    });
    tl.to({}, { duration: 0.6 });
  });

  return (
    <section ref={root} aria-labelledby="settle-title" className="flex min-h-svh items-center pt-20 pb-10">
      <div className="mx-auto grid w-full max-w-[1180px] items-center gap-6 px-4 md:grid-cols-[1fr_minmax(0,480px)] md:gap-16 md:px-8">
        <div className="max-w-[30rem] self-end">
          <h2 id="settle-title" className="font-serif text-[clamp(40px,7vw,76px)] leading-[0.95]">
            {t('f4t')}
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-text-2">{t('f4b')}</p>
        </div>
        <figure className="relative mx-auto aspect-square md:col-start-2 md:row-span-2 md:row-start-1 w-full max-w-[min(440px,58svh)]">
          <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            {PAIRS.map(([a, b]) => {
              const s = segment(a, b);
              return (
                <line
                  key={`${a}${b}`}
                  data-tangle
                  {...s}
                  stroke="var(--hairline-strong)"
                  strokeWidth="1.5"
                  strokeDasharray="1 0"
                />
              );
            })}
            {TRANSFERS.map((x) => {
              const s = segment(x.from, x.to);
              const head = `${s.x2},${s.y2} ${s.x2 - s.ux * 10 - s.uy * 6},${s.y2 - s.uy * 10 + s.ux * 6} ${s.x2 - s.ux * 10 + s.uy * 6},${s.y2 - s.uy * 10 - s.ux * 6}`;
              const mx = s.x1 + (s.x2 - s.x1) * x.tag;
              const my = s.y1 + (s.y2 - s.y1) * x.tag;
              return (
                <g key={`${x.from}-${x.to}`} data-pay>
                  <line
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2 - s.ux * 6}
                    y2={s.y2 - s.uy * 6}
                    stroke="var(--flame)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <polygon data-head points={head} fill="var(--flame)" />
                  <g data-tag>
                    <rect
                      x={mx - 30}
                      y={my - 13}
                      width="60"
                      height="26"
                      rx="13"
                      fill="var(--surface-2)"
                      stroke="rgb(255 184 41 / 0.4)"
                    />
                    <text
                      x={mx}
                      y={my + 5}
                      textAnchor="middle"
                      fill="var(--text)"
                      fontSize="14"
                      fontWeight="600"
                      className="tnum"
                    >
                      {formatINR(x.amount)}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
          {PEOPLE.map((p, i) => {
            const { x, y } = at(i);
            return (
              <div
                key={p.name}
                data-node
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${(x / 400) * 100}%`, top: `${(y / 400) * 100}%` }}
              >
                <span
                  className="rounded-full"
                  style={{ boxShadow: `0 0 24px color-mix(in srgb, ${colorHex(p.color)} 35%, transparent)` }}
                >
                  <Avatar name={p.name} color={p.color} size={52} />
                </span>
                {/* the top node's arrows arrive from below, so its label sits above */}
                <span
                  className={cn(
                    'absolute text-center text-caption whitespace-nowrap',
                    i === 0 ? 'bottom-full mb-1' : 'top-full mt-1',
                  )}
                >
                  <span className="block font-semibold">{p.name}</span>
                  <span className={p.net > 0 ? 'tnum text-win' : 'tnum text-loss'}>
                    {formatSigned(p.net)}
                  </span>
                </span>
              </div>
            );
          })}
        </figure>
        <ol
          className="divide-y divide-hairline self-start border-y border-hairline md:col-start-1 md:row-start-2"
          aria-label={ts('fewest')}
        >
          {TRANSFERS.map((x) => (
            <li key={`${x.from}-${x.to}`} data-row className="flex items-center gap-3 py-2.5">
              <Avatar name={PEOPLE[x.from]!.name} color={PEOPLE[x.from]!.color} size={28} />
              <span className="flex-1">
                {PEOPLE[x.from]!.name} → {PEOPLE[x.to]!.name}
              </span>
              <span className="tnum font-semibold">{formatINR(x.amount)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
