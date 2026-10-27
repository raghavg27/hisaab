import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'surface' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'lg' | 'sm';

const variants: Record<Variant, string> = {
  primary: 'bg-flame text-on-flame shadow-[var(--glow-flame)] font-semibold',
  surface: 'bg-surface-2 text-text shadow-[var(--key)] active:shadow-[var(--key-pressed)]',
  outline: 'border border-hairline-strong text-text active:bg-surface-2',
  ghost: 'text-text-2 active:bg-surface-2',
  danger: 'border border-loss/40 text-loss active:bg-surface-2',
};
const sizes: Record<Size, string> = {
  sm: 'min-h-10 px-3 text-label',
  md: 'min-h-12 px-4 text-body',
  lg: 'min-h-14 px-5 text-body w-full',
};

export function Button({
  variant = 'surface',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-btn)] font-medium transition-transform duration-100 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
