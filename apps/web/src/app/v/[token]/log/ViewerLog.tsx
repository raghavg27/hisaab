'use client';
import { useTranslations } from 'next-intl';
import { Loading } from '@/components/Splash';
import { LogView } from '@/components/night/LogView';
import { useViewerNight } from '@/components/night/useViewerNight';
import { useGo } from '@/lib/nav';

export function ViewerLog({ token }: { token: string }) {
  const t = useTranslations('viewer');
  const go = useGo();
  const { night, error } = useViewerNight(token);
  if (error) return <p className="p-6 text-text-2">{error === 'expired' ? t('expired') : error}</p>;
  if (!night) return <Loading />;
  return (
    <div className="mx-auto max-w-[480px]">
      <LogView night={night} onBack={() => go(`/v/${token}`)} />
    </div>
  );
}
