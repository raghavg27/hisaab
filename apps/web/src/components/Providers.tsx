'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { startAuth } from '@/lib/auth';
import { usePrefs } from '@/lib/prefs';
import { startSync } from '@/lib/sync';
import en from '@/messages/en.json';
import hi from '@/messages/hi-Latn.json';

const messages = { en, 'hi-Latn': hi };

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, networkMode: 'offlineFirst' } } }),
  );
  const [mounted, setMounted] = useState(false);
  const pref = usePrefs((s) => s.locale);
  const locale = mounted ? pref : 'en';

  useEffect(() => {
    setMounted(true);
    startAuth();
    startSync();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      void navigator.serviceWorker.register('/serwist/sw.js', { scope: '/' });
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'hi-Latn' ? 'hi-Latn' : 'en-IN';
  }, [locale]);

  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Kolkata">
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
