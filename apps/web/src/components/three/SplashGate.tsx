'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLiteVisuals } from '@/lib/prefs';
import { SplashLite } from './SplashLite';

const DiyaSplash = dynamic(() => import('./DiyaSplash').then((m) => m.DiyaSplash), { ssr: false });

const KEY = 'hisaab-splash-day';

/** Splash (≤ 1.6 s, once per day, skippable). WebGL only when the device can afford it. */
export function SplashGate() {
  const [show, setShow] = useState(false);
  const [lite, setLite] = useState(true);
  useEffect(() => {
    const today = new Date().toDateString();
    try {
      if (localStorage.getItem(KEY) === today) return;
      localStorage.setItem(KEY, today);
    } catch {
      return;
    }
    setLite(useLiteVisuals());
    setShow(true);
  }, []);
  if (!show) return null;
  const done = () => setShow(false);
  return lite ? <SplashLite onDone={done} /> : <DiyaSplash onDone={done} />;
}
