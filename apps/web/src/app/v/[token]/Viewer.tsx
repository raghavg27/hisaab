'use client';
import { activeStints, isSettleable, tableTotals } from '@hisaab/ledger';
import { AmountText, Avatar, Button, Sheet } from '@hisaab/ui';
import { AnimatePresence } from 'motion/react';
import { ScrollText } from 'lucide-react';
import { UserCheck } from '@/components/AnimatedIcon';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { DiyaMark } from '@/components/DiyaMark';
import { Loading } from '@/components/Splash';
import { ToastHost } from '@/components/ToastHost';
import { PlayerCard } from '@/components/night/PlayerCard';
import { SettlementView } from '@/components/night/SettlementView';
import { useViewerNight } from '@/components/night/useViewerNight';
import { useAuth } from '@/lib/auth';
import { useGo } from '@/lib/nav';
import type { Night } from '@/lib/night';
import { supabase } from '@/lib/supabase';
import { pullGroups } from '@/lib/sync';
import { useToast } from '@/lib/toast';

const OFFLINE_AFTER_MS = 2 * 60_000;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export function Viewer({ token }: { token: string }) {
  const t = useTranslations('viewer');
  const tc = useTranslations('common');
  const { night, notSynced, error, retry } = useViewerNight(token);

  if (error === 'expired') return <Message text={t('expired')} />;
  if (error)
    return (
      <Message text={error}>
        <Button variant="surface" onClick={retry}>
          {tc('retry')}
        </Button>
      </Message>
    );
  if (notSynced) return <Message text={t('notSynced')} />;
  if (!night) return <Loading />;
  return <ViewerTable night={night} token={token} />;
}

function Message({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
      <DiyaMark size={40} />
      <p className="text-text-2">{text}</p>
      {children}
    </main>
  );
}

function ViewerHeader({ night }: { night: Night }) {
  const t = useTranslations('viewer');
  const th = useTranslations('host');
  const { session, members, events } = night;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, []);
  const host = members.find((m) => m.userId === session.hostUserId)?.nickname ?? '?';
  const lastEvent = events.at(-1)?.clientTs;
  const seen = session.hostLastSeenAt ? new Date(session.hostLastSeenAt).getTime() : null;
  const offline = session.status !== 'closed' && seen !== null && now - seen > OFFLINE_AFTER_MS;
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-bg/95 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 backdrop-blur">
      <h1 className="truncate font-semibold">{session.title}</h1>
      <p className="text-caption text-text-3">
        {t('viewing', { name: host })}
        {lastEvent && ` · ${t('lastUpdate', { time: time(lastEvent) })}`}
      </p>
      {offline && (
        <p role="status" className="mt-1 text-caption text-warn">
          {th('offline', { minutes: Math.floor((now - seen!) / 60_000) })}
        </p>
      )}
    </header>
  );
}

function ViewerTable({ night, token }: { night: Night; token: string }) {
  const tl = useTranslations('live');
  const go = useGo();
  const { state, session } = night;
  const settled = state.status === 'closed' || (state.status !== 'live' && isSettleable(state));

  return (
    <div className="mx-auto min-h-dvh max-w-[480px] pb-28">
      <ViewerHeader night={night} />
      {settled ? (
        <SettlementView night={night} viewer />
      ) : (
        <LiveList night={night} />
      )}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-[480px] grid-cols-2 gap-2 border-t border-hairline bg-bg/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
        <Button variant="surface" onClick={() => go(`/v/${token}/log`)}>
          <ScrollText size={18} strokeWidth={1.5} aria-hidden /> {tl('log')}
        </Button>
        <ThisIsMe night={night} token={token} sessionId={session.id} />
      </div>
      <ToastHost bottom={110} />
    </div>
  );
}

function LiveList({ night }: { night: Night }) {
  const tl = useTranslations('live');
  const tc = useTranslations('common');
  const { state, session } = night;
  const totals = tableTotals(state.stints);
  const active = activeStints(state);
  const noop = () => {};
  return (
    <main className="px-4 pt-3">
      <dl className="mb-4 grid grid-cols-3 gap-2">
        {[
          [tl('bank'), totals.bankCash],
          [tl('onTable'), totals.chipsOnTable],
          [tl('shortsOut'), totals.shortsOut],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-[var(--radius-btn)] bg-surface-1 px-3 py-1.5">
            <dt className="text-caption text-text-3">{label}</dt>
            <dd className="text-body font-semibold">
              <AmountText value={value as number} />
            </dd>
          </div>
        ))}
      </dl>
      <ul aria-label={tc('players', { count: active.length })} className="grid gap-2">
        <AnimatePresence initial={false}>
          {active.map((s) => (
            <PlayerCard
              key={s.id}
              stint={s}
              member={night.member(s.memberId)}
              isBank={state.bankHolderMemberId === s.memberId}
              isHost={night.member(s.memberId)?.userId === session.hostUserId}
              canAct={false}
              onTopUp={noop}
              onShort={noop}
              onMore={noop}
            />
          ))}
        </AnimatePresence>
      </ul>
    </main>
  );
}

/** "This is me" (§8.7): claim your member profile so the night lands in your history. */
function ThisIsMe({ night, token, sessionId }: { night: Night; token: string; sessionId: string }) {
  const t = useTranslations('viewer');
  const { isAnonymous, userId, profile } = useAuth();
  const go = useGo();
  const show = useToast((s) => s.show);
  const [open, setOpen] = useState(false);
  const back = `/v/${token}`;
  const mine = night.members.find((m) => m.userId === userId);
  const played = new Set(night.state.stints.map((s) => s.memberId));
  const claimable = night.members.filter((m) => !m.userId && !m.archivedAt && played.has(m.id));
  if (mine || (!isAnonymous && !claimable.length)) return <span />;

  function start() {
    if (isAnonymous) go(`/login?next=${encodeURIComponent(back)}`);
    else if (!profile?.ageConfirmedAt) go(`/app/onboarding?next=${encodeURIComponent(back)}`);
    else setOpen(true);
  }

  async function claim(memberId: string) {
    const { error } = await supabase().rpc('claim_member_via_session', { session_id: sessionId, member_id: memberId });
    setOpen(false);
    if (error) return show({ message: error.message, tone: 'error' });
    await pullGroups();
    show({ message: t('claimed') });
  }

  return (
    <>
      <Button variant="primary" onClick={start} aria-describedby={isAnonymous ? 'me-hint' : undefined}>
        <UserCheck size={18} strokeWidth={1.5} aria-hidden /> {t('thisIsMe')}
      </Button>
      {isAnonymous && (
        <span id="me-hint" className="sr-only">
          {t('thisIsMeBody')}
        </span>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('pickYou')}>
        <ul className="grid gap-2">
          {claimable.map((m) => (
            <li key={m.id}>
              <Button variant="surface" size="lg" className="justify-start" onClick={() => claim(m.id)}>
                <Avatar name={m.nickname} color={m.color} size={32} /> {m.nickname}
              </Button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
