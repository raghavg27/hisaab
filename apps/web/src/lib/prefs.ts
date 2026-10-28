'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { playSound } from './sound';

export type Locale = 'en' | 'hi-Latn';

interface Prefs {
  locale: Locale;
  /** 'system' follows prefers-reduced-motion. */
  motion: 'system' | 'full' | 'reduced';
  sounds: boolean;
  haptics: boolean;
  set: (p: Partial<Omit<Prefs, 'set'>>) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      locale: 'en',
      motion: 'system',
      sounds: false,
      haptics: true,
      set: (p) => set(p),
    }),
    { name: 'hisaab-prefs' },
  ),
);

export function prefersReducedMotion(): boolean {
  const m = usePrefs.getState().motion;
  if (m !== 'system') return m === 'reduced';
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when the 3D scenes should fall back to CSS/Canvas2D (§11.5). */
export function liteVisuals(): boolean {
  if (typeof navigator === 'undefined') return true;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (
    prefersReducedMotion() ||
    (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) ||
    nav.connection?.saveData === true
  );
}

/** Feedback for a confirmed action: a short buzz, and the chip clink if sounds are on. */
export function haptic() {
  const { haptics, sounds } = usePrefs.getState();
  if (haptics && typeof navigator !== 'undefined') navigator.vibrate?.(10);
  if (sounds) playSound('clink');
}
