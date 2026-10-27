import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/** JetBrains Mono, 11px, uppercase, gold. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn('font-mono text-[11px] uppercase tracking-[0.08em] text-gold', className)}
      {...props}
    />
  );
}
