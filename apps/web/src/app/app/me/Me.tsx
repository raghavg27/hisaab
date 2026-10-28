'use client';
import { Button, Eyebrow, MEMBER_COLOR_KEYS, Sheet, cn, colorHex } from '@hisaab/ui';
import { Smartphone, Trash2 } from 'lucide-react';
import { Download, LogOut } from '@/components/AnimatedIcon';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Field } from '@/components/Field';
import { canInstall, openInstall } from '@/components/InstallPrompt';
import { ToastHost } from '@/components/ToastHost';
import { Toggle } from '@/components/Toggle';
import { saveProfile, signOut, useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { useGo } from '@/lib/nav';
import { usePrefs, type Locale } from '@/lib/prefs';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast';

export function Me() {
  const t = useTranslations('me');
  const tc = useTranslations('common');
  const { profile, session } = useAuth();
  const prefs = usePrefs();
  const show = useToast((s) => s.show);
  const go = useGo();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  async function save(patch: Partial<typeof profile>) {
    try {
      await saveProfile({ ...profile!, ...patch });
      show({ message: tc('done') }, 2000);
    } catch (e) {
      show({ message: navigator.onLine ? (e as Error).message : tc('offline'), tone: 'error' });
    }
  }

  async function exportData() {
    const [groups, members, sessions, events] = await Promise.all([
      db.groups.toArray(),
      db.members.toArray(),
      db.sessions.toArray(),
      db.events.toArray(),
    ]);
    const data = { exportedAt: new Date().toISOString(), email: session?.user.email, profile, groups, members, sessions, events };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `hisaab-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function deleteAccount() {
    setBusy(true);
    const { error } = await supabase().rpc('delete_me');
    if (error) {
      setBusy(false);
      return show({ message: navigator.onLine ? error.message : tc('offline'), tone: 'error' });
    }
    await signOut();
    go('/', { replace: true });
  }

  const motionOptions = [
    ['system', t('motionSystem')],
    ['full', t('motionFull')],
    ['reduced', t('motionReduced')],
  ] as const;
  const languages: [Locale, string][] = [
    ['en', t('english')],
    ['hi-Latn', t('hinglish')],
  ];

  return (
    <main className="px-4 pt-6">
      <h1 className="mb-1 font-serif text-[28px]">{t('title')}</h1>
      <p className="mb-6 text-caption text-text-3">{session?.user.email}</p>

      <section className="mb-8 grid gap-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void save({ displayName: name.trim() });
          }}
        >
          <Field className="flex-1" label={t('displayName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={24} />
          <Button type="submit" variant="surface" disabled={!name.trim() || name.trim() === profile.displayName}>
            {tc('save')}
          </Button>
        </form>
        <fieldset>
          <legend className="mb-1.5 text-label text-text-2">{t('color')}</legend>
          <div className="grid grid-cols-6 gap-2">
            {MEMBER_COLOR_KEYS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={profile.avatarColor === c}
                onClick={() => void save({ avatarColor: c })}
                className={cn('aspect-square rounded-full', profile.avatarColor === c && 'ring-2 ring-text ring-offset-2 ring-offset-bg')}
                style={{ background: colorHex(c) }}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <section className="mb-8">
        <Eyebrow className="mb-2">{t('language')}</Eyebrow>
        <Segmented value={prefs.locale} options={languages} onChange={(locale) => prefs.set({ locale })} label={t('language')} />
        <Eyebrow className="mt-5 mb-2">{t('motion')}</Eyebrow>
        <Segmented value={prefs.motion} options={motionOptions} onChange={(motion) => prefs.set({ motion })} label={t('motion')} />
        <div className="mt-4 divide-y divide-hairline">
          <Toggle checked={prefs.sounds} onChange={(sounds) => prefs.set({ sounds })} label={t('sounds')} />
          <Toggle checked={prefs.haptics} onChange={(haptics) => prefs.set({ haptics })} label={t('haptics')} />
        </div>
      </section>

      <section className="mb-8 grid gap-2">
        {canInstall() && (
          <Button variant="surface" size="lg" onClick={openInstall}>
            <Smartphone size={18} strokeWidth={1.5} aria-hidden /> {t('install')}
          </Button>
        )}
        <Button variant="surface" size="lg" onClick={exportData}>
          <Download size={18} strokeWidth={1.5} aria-hidden /> {t('export')}
        </Button>
        <Button variant="outline" size="lg" onClick={async () => (await signOut(), go('/', { replace: true }))}>
          <LogOut size={18} strokeWidth={1.5} aria-hidden /> {t('signOut')}
        </Button>
        <Button variant="danger" size="lg" onClick={() => setDeleting(true)}>
          <Trash2 size={18} strokeWidth={1.5} aria-hidden /> {t('delete')}
        </Button>
        <p className="mt-2 text-center text-caption text-text-3">
          <Link href="/legal/terms" className="underline">
            {t('legal')}
          </Link>
        </p>
      </section>

      <Sheet open={deleting} onClose={() => setDeleting(false)} title={t('delete')}>
        <p className="mb-4 text-text-2">{t('deleteBody')}</p>
        <Field label={t('deleteConfirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoCapitalize="characters" />
        <Button className="mt-4" variant="danger" size="lg" disabled={confirm !== 'DELETE' || busy} onClick={deleteAccount}>
          {t('delete')}
        </Button>
      </Sheet>
      <ToastHost />
    </main>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-[var(--radius-btn)] bg-well p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn('min-h-10 flex-1 rounded-[calc(var(--radius-btn)-4px)] text-label', value === v ? 'bg-surface-2 text-text shadow-[var(--key)]' : 'text-text-2')}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
