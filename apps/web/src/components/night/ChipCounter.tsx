'use client';
import type { ChipSet } from '@hisaab/ledger';
import { formatINR } from '@hisaab/ui';
import { Minus, Plus } from 'lucide-react';

/** Steppers per chip color; the total is chips × value. */
export function ChipCounter({
  chipSet,
  counts,
  onChange,
}: {
  chipSet: ChipSet;
  counts: Record<string, number>;
  onChange: (counts: Record<string, number>, total: number) => void;
}) {
  const set = (label: string, n: number) => {
    const next = { ...counts, [label]: Math.max(0, n) };
    onChange(next, chipTotal(chipSet, next));
  };
  return (
    <ul className="space-y-2">
      {chipSet.map((c) => {
        const n = counts[c.label] ?? 0;
        return (
          <li key={c.label} className="flex items-center gap-3">
            <span aria-hidden className="size-6 shrink-0 rounded-full border-2 border-dashed" style={{ background: c.color, borderColor: 'rgb(255 247 221 / .5)' }} />
            <span className="flex-1 text-label">
              {c.label} <span className="text-text-3">{formatINR(c.value)}</span>
            </span>
            <button type="button" aria-label={`${c.label} minus`} onClick={() => set(c.label, n - 1)} className="flex size-12 items-center justify-center rounded-[var(--radius-btn)] bg-surface-1 shadow-[var(--key)] active:shadow-[var(--key-pressed)]">
              <Minus size={18} strokeWidth={1.5} />
            </button>
            <input
              aria-label={`${c.label} count`}
              inputMode="numeric"
              value={n}
              onChange={(e) => set(c.label, Number(e.target.value.replace(/\D/g, '')) || 0)}
              className="tnum h-12 w-14 rounded-[var(--radius-btn)] bg-well text-center shadow-[var(--key-pressed)]"
            />
            <button type="button" aria-label={`${c.label} plus`} onClick={() => set(c.label, n + 1)} className="flex size-12 items-center justify-center rounded-[var(--radius-btn)] bg-surface-1 shadow-[var(--key)] active:shadow-[var(--key-pressed)]">
              <Plus size={18} strokeWidth={1.5} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function chipTotal(chipSet: ChipSet, counts: Record<string, number>) {
  return chipSet.reduce((a, c) => a + c.value * (counts[c.label] ?? 0), 0);
}
