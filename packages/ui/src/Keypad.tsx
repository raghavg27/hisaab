'use client';
import { Delete } from 'lucide-react';
import { formatGrouped } from './format';
import { cn } from './cn';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'] as const;
const MAX = 99_99_999;

/** Custom numeric keypad (no OS keyboard). Shows Indian grouping live. */
export function Keypad({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label?: string;
}) {
  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'del') return onChange(Math.floor(value / 10));
    const next = Number(`${value || ''}${k}`);
    if (next <= MAX) onChange(next);
  };
  return (
    <div>
      <div
        className="mb-3 flex h-16 items-center justify-end rounded-[var(--radius-btn)] bg-well px-4 shadow-[var(--key-pressed)]"
        aria-live="polite"
        aria-label={label ? `${label}: ${value} rupees` : `${value} rupees`}
      >
        <span className="tnum text-amount font-semibold">
          <span className="text-text-3">₹</span>
          {value ? formatGrouped(value) : <span className="text-text-3">0</span>}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Delete digit' : k}
            className={cn(
              'tnum flex h-14 items-center justify-center rounded-[var(--radius-btn)] bg-surface-1 text-title font-medium shadow-[var(--key)] transition-transform duration-100 active:scale-[0.97] active:shadow-[var(--key-pressed)] focus-visible:outline-2 focus-visible:outline-flame',
            )}
          >
            {k === 'del' ? <Delete size={20} strokeWidth={1.5} /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
