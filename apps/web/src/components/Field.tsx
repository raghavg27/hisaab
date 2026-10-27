import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@hisaab/ui';

export function Field({
  label,
  hint,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-label text-text-2">{label}</span>
      <input
        className="h-12 w-full rounded-[var(--radius-btn)] bg-well px-4 text-body text-text shadow-[var(--key-pressed)] outline-none placeholder:text-text-3 focus-visible:outline-2 focus-visible:outline-flame"
        aria-invalid={!!error}
        {...props}
      />
      {error ? (
        <span role="alert" className="mt-1.5 block text-caption text-loss">
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-caption text-text-3">{hint}</span>
      )}
    </label>
  );
}
