'use client';
import { useTranslations } from 'next-intl';
import { DiyaMark } from '@/components/DiyaMark';

export default function Offline() {
  const t = useTranslations('offline');
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-3 px-4 text-center">
      <DiyaMark size={40} />
      <h1 className="font-serif text-[36px]">{t('title')}</h1>
      <p className="text-text-2">{t('body')}</p>
    </main>
  );
}
