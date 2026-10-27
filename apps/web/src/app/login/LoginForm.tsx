'use client';
import { Button, Eyebrow } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { Field } from '@/components/Field';
import { useAuth } from '@/lib/auth';
import { APP_NAME, FLAGS } from '@/lib/config';
import { useGo } from '@/lib/nav';
import { supabase } from '@/lib/supabase';

export function LoginForm() {
  const t = useTranslations('auth');
  const next = useSearchParams().get('next') ?? '/app';
  const go = useGo();
  const { ready, userId, isAnonymous } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && userId && !isAnonymous) go(next, { replace: true });
  }, [ready, userId, isAnonymous, next, go]);

  const redirectTo = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!navigator.onLine) return setError(t('needOnline'));
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo(), shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setError(t('invalidCode'));
  }

  async function google() {
    await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } });
  }

  return (
    <main className="rangoli mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <DiyaMark size={28} />
        <Eyebrow>{APP_NAME}</Eyebrow>
      </div>
      {!sent ? (
        <form onSubmit={send} className="space-y-4">
          <h1 className="font-serif text-display leading-none">{t('title')}</h1>
          <p className="text-text-2">{t('subtitle')}</p>
          <Field
            label={t('email')}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy || !email}>
            {busy ? t('sending') : t('sendCode')}
          </Button>
          {FLAGS.googleAuth && (
            <Button variant="outline" size="lg" onClick={google}>
              {t('google')}
            </Button>
          )}
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <h1 className="font-serif text-[36px] leading-tight">{t('checkEmail', { email })}</h1>
          <p className="text-text-2">{t('checkEmailBody')}</p>
          <Field
            label={t('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={error}
            className="tnum"
          />
          <Button type="submit" variant="primary" size="lg" disabled={busy || code.length < 6}>
            {busy ? t('verifying') : t('verify')}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => (setSent(false), setCode(''))}>
            {t('wrongEmail')}
          </Button>
        </form>
      )}
    </main>
  );
}
