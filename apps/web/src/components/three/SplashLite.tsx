'use client';
import { useEffect } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { prefersReducedMotion } from '@/lib/prefs';

/** CSS fallback with the same 1.6 s timing. */
export function SplashLite({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const h = setTimeout(onDone, prefersReducedMotion() ? 400 : 1600);
    return () => clearTimeout(h);
  }, [onDone]);
  return (
    <div
      role="presentation"
      onClick={onDone}
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg"
      style={{ animation: 'hisaab-splash-out 0.3s ease-in 1.3s forwards' }}
    >
      <div style={{ animation: 'hisaab-flicker 1.2s ease-in-out infinite alternate', filter: 'drop-shadow(0 0 24px rgb(255 184 41 / .45))' }}>
        <DiyaMark size={72} />
      </div>
      <style>{`@keyframes hisaab-flicker{from{transform:scale(.96);opacity:.85}to{transform:scale(1.04);opacity:1}}@keyframes hisaab-splash-out{to{opacity:0;visibility:hidden}}`}</style>
    </div>
  );
}
