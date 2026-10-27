'use client';
import { useEffect, useRef } from 'react';

/** Canvas2D fallback for the spark burst: same 1.2 s timing, ~300 particles. */
export function SparksLite({ count = 300 }: { count?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(1.5, devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const cx = c.width / 2,
      cy = c.height * 0.38;
    const ps = Array.from({ length: count }, () => {
      const a = Math.random() * Math.PI * 2;
      const v = (0.3 + Math.random()) * 6 * dpr;
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2 * dpr, hue: 30 + Math.random() * 20 };
    });
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1200;
      ctx.clearRect(0, 0, c.width, c.height);
      if (t >= 1) return;
      for (const p of ps) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12 * dpr;
        p.vx *= 0.985;
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${60 + 20 * (1 - t)}%, ${1 - t})`;
        ctx.fillRect(p.x, p.y, 2 * dpr, 2 * dpr);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => document.hidden && cancelAnimationFrame(raf);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [count]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />;
}
