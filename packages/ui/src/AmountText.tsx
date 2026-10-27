'use client';
import { motion, useReducedMotion } from 'motion/react';
import { formatINR, formatSigned, rupeesLabel } from './format';
import { cn } from './cn';

const DIGITS = '0123456789';

function Digit({ d }: { d: string }) {
  const reduce = useReducedMotion();
  const i = DIGITS.indexOf(d);
  return (
    <span className="relative inline-block h-[1.15em] overflow-hidden align-bottom" style={{ width: '1ch' }}>
      <motion.span
        className="absolute left-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-i * 1.15}em` }}
        transition={reduce ? { duration: 0 } : { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {[...DIGITS].map((x) => (
          <span key={x} className="block h-[1.15em] leading-[1.15em]">
            {x}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Amount with per-digit roll (280ms) and tabular figures. Reads in full for screen readers. */
export function AmountText({
  value,
  signed = false,
  tone = false,
  className,
}: {
  value: number;
  signed?: boolean;
  /** Color by sign (win/loss). The sign is always shown too. */
  tone?: boolean;
  className?: string;
}) {
  const text = signed ? formatSigned(value) : formatINR(value);
  return (
    <span
      className={cn('tnum inline-flex whitespace-nowrap', tone && value > 0 && 'text-win', tone && value < 0 && 'text-loss', className)}
      aria-label={rupeesLabel(value)}
      role="text"
    >
      <span aria-hidden className="inline-flex">
        {[...text].map((ch, idx) =>
          DIGITS.includes(ch) ? (
            <Digit key={text.length - idx} d={ch} />
          ) : (
            <span key={`${text.length - idx}${ch}`} className="leading-[1.15em]">
              {ch}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
