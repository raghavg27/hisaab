import { useId } from 'react';

/** Custom diya mark: two-tone flame gradient over a clay lamp. */
export function DiyaMark({ size = 32, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB829" />
          <stop offset="1" stopColor="#FF7A1A" />
        </linearGradient>
      </defs>
      <path d="M16 3c3 4.5 5 7.4 5 10.2A5 5 0 0 1 16 18a5 5 0 0 1-5-4.8C11 10.4 13 7.5 16 3z" fill={`url(#${id})`} />
      <path d="M4 19h24c-1.2 5.2-6 9-12 9S5.2 24.2 4 19z" fill="#C8AD86" />
      <path d="M4 19h24" stroke="#FFF7DD" strokeOpacity=".25" strokeWidth="1" />
    </svg>
  );
}
