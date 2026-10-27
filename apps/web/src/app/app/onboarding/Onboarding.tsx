'use client';
import { Button, Eyebrow, MEMBER_COLOR_KEYS, cn } from '@hisaab/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { Field } from '@/components/Field';
import { saveProfile, useAuth } from '@/lib/auth';
import { useGo } from '@/lib/nav';
import { usePrefs } from '@/lib/prefs';

export function Onboarding() {
  const t = useTranslations('onboarding');
  const { userId, profile, session } = useAuth();
  const locale = usePrefs((s) => s.locale);
  const next = useSearchParams().get('next') ?? '/app';
  const go = useGo();
  const [name, setName] = useState(profile?.displayName ?? session?.user.email?.split('@')[0] ?? '');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<number | null>(profile?.ageConfirmedAt ? 0 : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    try {
      await saveProfile({
        id: userId,
        displayName: name.trim(),
        avatarColor: profile?.avatarColor ?? MEMBER_COLOR_KEYS[Math.floor(Math.random() * 12)]!,
        locale,
        ageConfirmedAt: new Date().toISOString(),
      });
      setCard(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const done = () => go(next.startsWith('/app') ? next : '/app', { replace: true });

  if (card !== null) {
    const cards = [
      [t('cards.c1t'), t('cards.c1b')],
      [t('cards.c2t'), t('cards.c2b')],
      [t('cards.c3t'), t('cards.c3b')],
    ] as const;
    const [title, body] = cards[card]!;
    return (
      <main className="rangoli flex min-h-dvh flex-col px-4 pt-6 pb-8">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={done}>
            {t('letsGo')}
          </Button>
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={card}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -50 && card < 2) setCard(card + 1);
                if (info.offset.x > 50 && card > 0) setCard(card - 1);
              }}
            >
              <Eyebrow>{`0${card + 1} / 03`}</Eyebrow>
              <h1 className="mt-3 font-serif text-display leading-[1.05]">{title}</h1>
              <p className="mt-4 text-text-2">{body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="mb-6 flex justify-center gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn('h-1.5 rounded-full transition-all', i === card ? 'w-6 bg-flame' : 'w-1.5 bg-hairline-strong')} />
          ))}
        </div>
        <Button variant="primary" size="lg" onClick={() => (card < 2 ? setCard(card + 1) : done())}>
          {card < 2 ? t('continue') : t('letsGo')}
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-4 py-10">
      <DiyaMark size={32} className="mb-6" />
      <form onSubmit={submit} className="space-y-5">
        <h1 className="font-serif text-[36px] leading-tight">{t('title')}</h1>
        <Field
          label={t('name')}
          placeholder={t('namePlaceholder')}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          error={error}
          required
          autoFocus
        />
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-hairline p-4">
          <input
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[var(--flame)]"
            required
          />
          <span className="text-text-2">{t('age')}</span>
        </label>
        <Button type="submit" variant="primary" size="lg" disabled={busy || !adult || !name.trim()}>
          {t('continue')}
        </Button>
      </form>
    </main>
  );
}
