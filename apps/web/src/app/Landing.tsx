'use client';
import { Eyebrow } from '@hisaab/ui';
import { CloudOff, Eye, ListChecks, Scale, ScrollText } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { DiyaMark } from '@/components/DiyaMark';
import { APP_NAME } from '@/lib/config';

const Splash = dynamic(() => import('@/components/three/SplashGate').then((m) => m.SplashGate), { ssr: false });

const FEATURES = [
  { Icon: ScrollText, k: 'f1' },
  { Icon: Eye, k: 'f2' },
  { Icon: Scale, k: 'f3' },
  { Icon: ListChecks, k: 'f4' },
  { Icon: CloudOff, k: 'f5' },
] as const;

export function Landing() {
  const t = useTranslations('landing');
  return (
    <div className="mx-auto max-w-[480px]">
      <Splash />
      <header className="flex items-center justify-between px-4 pt-6">
        <span className="flex items-center gap-2">
          <DiyaMark size={28} />
          <Eyebrow>{APP_NAME}</Eyebrow>
        </span>
        <Link href="/login" className="min-h-12 content-center px-2 text-label text-text-2">
          Sign in
        </Link>
      </header>
      <main>
        <section className="rangoli px-4 pt-16 pb-14">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <h1 className="mt-4 font-serif text-hero leading-[0.95]">{t('hero')}</h1>
          <p className="mt-5 text-[17px] text-text-2">{t('sub')}</p>
          <Link
            href="/app/new"
            className="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-[var(--radius-btn)] bg-flame text-body font-semibold text-on-flame shadow-[var(--glow-flame)]"
          >
            {t('cta')}
          </Link>
          <p className="mt-3 text-center text-caption text-text-3">{t('noMoney')}</p>
        </section>
        <section className="space-y-3 px-4 pb-16">
          {FEATURES.map(({ Icon, k }) => (
            <article key={k} className="rounded-[var(--radius-card)] border border-hairline bg-surface-1 p-4">
              <Icon size={20} strokeWidth={1.5} className="mb-3 text-gold" aria-hidden />
              <h2 className="text-title font-semibold">{t(`${k}t`)}</h2>
              <p className="mt-1 text-text-2">{t(`${k}b`)}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="border-t border-hairline px-4 py-8 text-caption text-text-3">
        <p>{t('adults')}</p>
        <p className="mt-3 flex gap-4">
          <Link href="/legal/terms" className="underline">
            {t('terms')}
          </Link>
          <Link href="/legal/privacy" className="underline">
            {t('privacy')}
          </Link>
        </p>
      </footer>
    </div>
  );
}
