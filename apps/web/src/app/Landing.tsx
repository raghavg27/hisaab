'use client';
import { cn } from '@hisaab/ui';
import { Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { CountCheck } from '@/components/landing/CountCheck';
import { clockText, useMotion } from '@/components/landing/useMotion';
import { NightLog } from '@/components/landing/NightLog';
import { SettleGraph } from '@/components/landing/SettleGraph';
import { APP_NAME } from '@/lib/config';
import { liteVisuals } from '@/lib/prefs';

const TableScene = dynamic(() => import('@/components/three/TableScene').then((m) => m.TableScene), {
  ssr: false,
});

const CTA =
  'inline-flex min-h-14 w-full items-center justify-center rounded-[var(--radius-btn)] bg-flame px-8 text-body font-semibold text-on-flame shadow-[var(--glow-flame)] transition-[box-shadow,transform] hover:shadow-[0_0_44px_rgb(255_184_41/0.5)] active:scale-[0.98] sm:w-auto';

/** False when WebGL would fall back to software rendering, where the scene would hog the CPU. */
function fastWebGL() {
  return !!document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
}

export function Landing() {
  const t = useTranslations('landing');
  const hero = useRef<HTMLElement>(null);
  const scroll = useRef(0);
  const [scene, setScene] = useState(false);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(true);
  const [sceneShift, setSceneShift] = useState(0);

  // The 3D table loads once the page is up, and only where the device can afford it. Desktops load it when idle;
  // phones wait for the first touch or scroll, so a visitor who only reads never pays for it.
  useEffect(() => {
    if (liteVisuals() || !fastWebGL()) return;
    const engage = ['pointerdown', 'touchstart', 'scroll', 'keydown'] as const;
    let timer = 0;
    // Safari has no requestIdleCallback
    const go = () => {
      stop();
      timer = window.setTimeout(() => (window.requestIdleCallback ?? setTimeout)(() => setScene(true)), 300);
    };
    const stop = () => {
      removeEventListener('load', go);
      engage.forEach((e) => removeEventListener(e, go));
    };
    engage.forEach((e) => addEventListener(e, go, { once: true, passive: true }));
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      if (document.readyState === 'complete') go();
      else addEventListener('load', go, { once: true });
    }
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, []);

  // Stop rendering the table once the hero is off screen.
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e!.isIntersecting));
    io.observe(hero.current!);
    return () => io.disconnect();
  }, []);

  // In portrait the chip stacks start ~57% down the hero. On short screens (iOS Safari's small viewport) the copy
  // reaches further than that, so slide the table down until it clears the copy.
  useEffect(() => {
    const el = hero.current!;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      const copy = el.querySelector<HTMLElement>('[data-hero-copy]')!;
      const clear = copy.offsetTop + copy.offsetHeight + 24 - 0.57 * h;
      setSceneShift(el.clientWidth / h > 1.1 ? 0 : Math.max(0, clear));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useMotion(hero, ({ gsap, ScrollTrigger, smoothScroll }) => {
    ScrollTrigger.create({
      trigger: hero.current,
      start: 'top top',
      end: 'bottom top',
      onUpdate: (s) => void (scroll.current = s.progress),
    });
    gsap.to('[data-hero-copy]', {
      yPercent: -14,
      autoAlpha: 0,
      ease: 'none',
      scrollTrigger: { trigger: hero.current, start: 'top top', end: 'bottom 35%', scrub: true },
    });
    return smoothScroll();
  });

  return (
    <div className="overflow-x-clip">
      <header className="fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-bg via-bg/90 to-transparent pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3 md:px-8">
          <span className="flex items-center gap-2">
            <DiyaMark size={28} />
            <span className="font-serif text-[24px] leading-none">{APP_NAME}</span>
          </span>
          <span className="flex items-center gap-1 text-label text-text-3" aria-hidden>
            <Moon size={14} strokeWidth={1.5} />
            <span id="night-clock" className="tnum">
              {clockText(21 * 60)}
            </span>
          </span>
          <Link href="/login" className="min-h-12 content-center px-2 text-label text-text-2 hover:text-text">
            Sign in
          </Link>
        </div>
      </header>

      <main>
        <section
          ref={hero}
          aria-labelledby="hero-title"
          className="relative h-svh min-h-[640px] overflow-hidden"
        >
          <div
            aria-hidden
            className={cn(
              'absolute top-[76%] left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1000 md:top-[62%] md:left-[70%]',
              ready && 'opacity-0',
            )}
          >
            <div className="absolute top-1/2 left-1/2 size-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_184_41/0.22),rgb(255_122_26/0.07)_45%,transparent)]" />
            <DiyaMark size={64} className="relative drop-shadow-[0_0_24px_rgb(255_184_41/0.45)]" />
          </div>
          {scene && (
            <div
              className={cn(
                'absolute inset-0 transition-opacity duration-1000',
                ready ? 'opacity-100' : 'opacity-0',
              )}
              style={{ transform: `translateY(${sceneShift}px)` }}
            >
              <TableScene scroll={scroll} active={inView} onReady={() => setReady(true)} />
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
          <div
            data-hero-copy
            className="relative mx-auto max-w-[1180px] px-4 pt-[max(104px,14svh)] md:px-8 md:pt-[24svh]"
          >
            <h1
              id="hero-title"
              className="max-w-[9ch] font-serif text-[clamp(64px,12.5vw,164px)] leading-[0.88]"
            >
              {t('hero')
                .split(' ')
                .map((w, i) => (
                  <span key={i}>
                    <span className="inline-block overflow-hidden pb-[0.1em] align-bottom">
                      <span
                        className="landing-rise inline-block"
                        style={{ animationDelay: `${100 + i * 110}ms` }}
                      >
                        {w}
                      </span>
                    </span>{' '}
                  </span>
                ))}
            </h1>
            <p className="mt-6 max-w-[34ch] text-[17px] leading-relaxed text-text-2 md:text-[19px]">
              {t('sub')}
            </p>
            <div className="pointer-events-auto mt-8 sm:flex sm:items-center sm:gap-5">
              <Link href="/app/new" className={CTA}>
                {t('cta')}
              </Link>
              <p className="mt-3 text-center text-caption text-text-3 sm:mt-0 sm:max-w-[22ch] sm:text-left">
                {t('noMoney')}
              </p>
            </div>
          </div>
        </section>

        <NightLog />
        <CountCheck />
        <SettleGraph />

        <section
          aria-labelledby="closer-title"
          className="relative overflow-hidden pt-24 pb-28 md:pt-36 md:pb-40"
        >
          <div className="pointer-events-none absolute -bottom-[40vmin] left-1/2 size-[90vmin] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_184_41/0.16),rgb(255_122_26/0.05)_50%,transparent)]" />
          <div className="relative mx-auto max-w-[1180px] px-4 md:px-8">
            <div className="max-w-[30rem] border-l border-hairline-strong pl-4">
              <p className="font-semibold">{t('f5t')}</p>
              <p className="mt-1 text-text-2">{t('f5b')}</p>
            </div>
            <h2
              id="closer-title"
              className="mt-20 max-w-[14ch] font-serif text-[clamp(48px,9vw,120px)] leading-[0.92]"
            >
              {t('closer')}
            </h2>
            <div className="mt-10 sm:flex sm:items-center sm:gap-5">
              <Link href="/app/new" className={CTA}>
                {t('cta')}
              </Link>
              <p className="mt-3 text-center text-caption text-text-3 sm:mt-0 sm:max-w-[22ch] sm:text-left">
                {t('noMoney')}
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-[1180px] px-4 py-8 text-caption text-text-3 md:flex md:justify-between md:px-8">
          <p>{t('adults')}</p>
          <p className="mt-3 flex gap-4 md:mt-0">
            <Link href="/legal/terms" className="underline">
              {t('terms')}
            </Link>
            <Link href="/legal/privacy" className="underline">
              {t('privacy')}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
