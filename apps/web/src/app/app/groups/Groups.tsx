'use client';
import { Button, Eyebrow, Sheet, cn, formatINR } from '@hisaab/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Field } from '@/components/Field';
import { db } from '@/lib/db';
import { createGroup } from '@/lib/groups';
import { useGo } from '@/lib/nav';

export const GROUP_EMOJIS = ['🪔', '🃏', '🎉', '🏠', '🍻', '👑', '🎲', '✨'];

export function Groups() {
  const t = useTranslations('group');
  const tw = useTranslations('wizard');
  const tc = useTranslations('common');
  const tt = useTranslations('tabs');
  const go = useGo();
  const groups = useLiveQuery(() => db.groups.filter((g) => !g.deletedAt).sortBy('name'), []);
  const counts = useLiveQuery(async () => {
    const ms = await db.members.filter((m) => !m.archivedAt).toArray();
    return Map.groupBy(ms, (m) => m.groupId);
  }, []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(GROUP_EMOJIS[0]!);
  const [buyIn, setBuyIn] = useState(500);
  if (!groups) return null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const g = await createGroup({ name, emoji, defaultBuyIn: buyIn });
    setOpen(false);
    go(`/app/g?id=${g.id}`);
  }

  return (
    <main className="px-4 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-[28px]">{tt('groups')}</h1>
        <Button variant="surface" size="sm" onClick={() => setOpen(true)}>
          <Plus size={18} strokeWidth={1.5} aria-hidden /> {t('newGroup')}
        </Button>
      </header>

      {groups.length === 0 ? (
        <p className="text-text-3">{t('noGroups')}</p>
      ) : (
        <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
          {groups.map((g) => (
            <li key={g.id}>
              <Link href={`/app/g?id=${g.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2">
                <span className="text-[24px]" aria-hidden>
                  {g.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{g.name}</span>
                  <span className="block text-caption text-text-3">
                    {tc('players', { count: counts?.get(g.id)?.length ?? 0 })} · {tc('buyIn')} {formatINR(g.defaultBuyIn)}
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={1.5} className="text-text-3" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={t('newGroup')}>
        <form onSubmit={create} className="grid gap-4">
          <Field label={t('name')} placeholder={tw('groupNamePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
          <fieldset>
            <legend className="mb-1.5 text-label text-text-2">{t('emoji')}</legend>
            <div className="flex flex-wrap gap-2">
              {GROUP_EMOJIS.map((x) => (
                <button
                  key={x}
                  type="button"
                  aria-pressed={emoji === x}
                  onClick={() => setEmoji(x)}
                  className={cn('size-12 rounded-[var(--radius-btn)] text-[22px]', emoji === x ? 'bg-surface-2 ring-2 ring-flame' : 'bg-well')}
                >
                  {x}
                </button>
              ))}
            </div>
          </fieldset>
          <Field
            label={t('defaultBuyIn')}
            type="number"
            inputMode="numeric"
            min={1}
            value={buyIn || ''}
            onChange={(e) => setBuyIn(Math.max(0, Math.floor(Number(e.target.value))))}
          />
          <Button type="submit" variant="primary" size="lg" disabled={!name.trim() || buyIn < 1}>
            {tw('create')}
          </Button>
        </form>
      </Sheet>
    </main>
  );
}
