'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGo } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

/** Magic-link landing: exchange the PKCE code for a session. */
export function Callback() {
  const t = useTranslations('auth');
  const params = useSearchParams();
  const go = useGo();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = params.get('code');
    const next = params.get('next') ?? '/app';
    if (!code) return setFailed(true);
    supabase()
      .auth.exchangeCodeForSession(code)
      .then(({ error }) => (error ? setFailed(true) : go(next.startsWith('/') ? next : '/app', { replace: true })));
  }, [params, go]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-text-2">{failed ? t('callbackFailed') : t('signingIn')}</p>
      {failed && (
        <Link href="/login" className="text-flame underline">
          {t('title')}
        </Link>
      )}
    </main>
  );
}
