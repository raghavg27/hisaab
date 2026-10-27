'use client';
import { Button, Sheet } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { track } from '@/lib/analytics';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const useInstall = create<{ deferred: BIPEvent | null; open: boolean }>(() => ({ deferred: null, open: false }));

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

/** Offer install after the first night is closed, not on first visit (§8.1). */
export function maybeOfferInstall() {
  if (standalone()) return;
  try {
    if (localStorage.getItem('hisaab-install-offered')) return;
    localStorage.setItem('hisaab-install-offered', '1');
  } catch {
    return;
  }
  if (useInstall.getState().deferred || isIos()) useInstall.setState({ open: true });
}

export function openInstall() {
  useInstall.setState({ open: true });
}

export function canInstall() {
  return !standalone() && (!!useInstall.getState().deferred || isIos());
}

export function InstallPrompt() {
  const t = useTranslations('install');
  const tm = useTranslations('me');
  const { deferred, open } = useInstall();
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setIos(isIos());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      useInstall.setState({ deferred: e as BIPEvent });
    };
    const onInstalled = () => track('pwa_installed', {});
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const close = () => useInstall.setState({ open: false });

  return (
    <Sheet open={open} onClose={close} title={ios && !deferred ? tm('iosInstallTitle') : t('title')}>
      <div className="space-y-3">
        <p className="text-text-2">{ios && !deferred ? tm('iosInstallBody') : t('body')}</p>
        {deferred && (
          <Button
            variant="primary"
            size="lg"
            onClick={async () => {
              await deferred.prompt();
              useInstall.setState({ deferred: null, open: false });
            }}
          >
            {t('cta')}
          </Button>
        )}
        <Button variant="ghost" size="lg" onClick={close}>
          {t('later')}
        </Button>
      </div>
    </Sheet>
  );
}
