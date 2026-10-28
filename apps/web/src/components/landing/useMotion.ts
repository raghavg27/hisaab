'use client';
import { useEffect, type DependencyList, type RefObject } from 'react';
import { prefersReducedMotion } from '@/lib/prefs';

type Motion = typeof import('./motion');

/**
 * Runs a GSAP setup scoped to `root` once the motion code has loaded, and reverts it on unmount.
 * Skipped under reduced motion, which leaves the server-rendered end state in place.
 */
export function useMotion(
  root: RefObject<HTMLElement | null>,
  setup: (m: Motion) => void | (() => void),
  deps: DependencyList = [],
) {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let live = true;
    let undo = () => {};
    void import('./motion').then((m) => {
      if (!live) return;
      let extra: void | (() => void);
      const ctx = m.gsap.context(() => void (extra = setup(m)), root.current!);
      undo = () => {
        ctx.revert();
        extra?.();
      };
    });
    return () => {
      live = false;
      undo();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** "9:04 pm" from minutes after midnight (may run past 24h). Hand-rolled so server and browser agree. */
export function clockText(minutes: number): string {
  const m = Math.round(minutes) % (24 * 60);
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Moves the header clock from one time to another across a scene's scroll range, so scrolling runs the night forward. */
export function runClock(from: number, to: number) {
  return (s: { progress: number }) => {
    const el = document.getElementById('night-clock');
    if (el) el.textContent = clockText(from + (to - from) * s.progress);
  };
}
