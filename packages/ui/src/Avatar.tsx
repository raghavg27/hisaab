import { colorHex } from './palette';
import { cn } from './cn';

export function Avatar({ name, color, size = 40, className }: { name: string; color: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `color-mix(in srgb, ${colorHex(color)} 22%, var(--surface-2))`,
        color: colorHex(color),
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${colorHex(color)} 45%, transparent)`,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
