'use client';
import { Avatar, Button } from '@hisaab/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { Loading } from '@/components/Splash';
import { ToastHost } from '@/components/ToastHost';
import { useGo } from '@/lib/nav';
import { supabase } from '@/lib/supabase';
import { pullGroups } from '@/lib/sync';
import { useToast } from '@/lib/toast';

interface Preview {
  group_id: string;
  name: string;
  emoji: string;
  member: boolean;
  unclaimed: { id: string; nickname: string; color: string }[];
}

/** /join/[token] (§8.2): join as a new member, or claim an unclaimed name ("I'm Rohit"). */
export function Join({ token }: { token: string }) {
  const t = useTranslations('join');
  const tc = useTranslations('common');
  const go = useGo();
  const show = useToast((s) => s.show);
  const [busy, setBusy] = useState(false);
  const preview = useQuery({
    queryKey: ['invite', token],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase().rpc('invite_preview', { invite_token: token });
      if (error) throw error;
      return data as Preview;
    },
  });

  // Already in the group: nothing to join.
  const alreadyIn = preview.data?.member ? preview.data.group_id : null;
  useEffect(() => {
    if (alreadyIn) go(`/app/g?id=${alreadyIn}`, { replace: true });
  }, [alreadyIn, go]);

  async function join(memberId: string | null) {
    setBusy(true);
    const { data, error } = await supabase().rpc('join_group', { invite_token: token, member_id: memberId });
    if (error) {
      setBusy(false);
      return show({ message: error.message, tone: 'error' });
    }
    await pullGroups();
    show({ message: t('joined') });
    go(`/app/g?id=${data as string}`, { replace: true });
  }

  if (preview.isPending) return <Loading />;
  if (preview.isError) {
    const expired = (preview.error as { code?: string }).code === 'P0002';
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <DiyaMark size={40} />
        <p className="text-text-2">{expired ? t('expired') : navigator.onLine ? preview.error.message : tc('offline')}</p>
      </main>
    );
  }
  const g = preview.data;
  if (g.member) return <Loading />;

  return (
    <main className="px-4 pt-10">
      <p className="mb-2 text-[40px]" aria-hidden>
        {g.emoji}
      </p>
      <h1 className="mb-2 font-serif text-[28px] leading-tight">{t('title', { group: g.name })}</h1>
      {g.unclaimed.length > 0 && <p className="mb-6 text-text-2">{t('body')}</p>}
      <ul className="mb-4 grid gap-2">
        {g.unclaimed.map((m) => (
          <li key={m.id}>
            <Button variant="surface" size="lg" className="justify-start" disabled={busy} onClick={() => join(m.id)}>
              <Avatar name={m.nickname} color={m.color} size={32} /> {t('claim', { name: m.nickname })}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="primary" size="lg" disabled={busy} onClick={() => join(null)}>
        {t('imNew')}
      </Button>
      <ToastHost />
    </main>
  );
}
