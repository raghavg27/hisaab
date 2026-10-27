'use client';
import { activeStints, countStatus, derive, planAdjustment, type Resolution, type StintState } from '@hisaab/ledger';
import { Avatar, Button, Keypad, Sheet, cn, formatINR, formatSigned } from '@hisaab/ui';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Loading } from '@/components/Splash';
import { ToastHost } from '@/components/ToastHost';
import { ChipCounter } from '@/components/night/ChipCounter';
import { MemberPick } from '@/components/night/LeaveSheet';
import { SyncPill } from '@/components/night/SyncPill';
import { useNightLoader } from '@/components/night/useNightLoader';
import { track } from '@/lib/analytics';
import { useGo, useQueryId } from '@/lib/nav';
import { record, recordOne, type Night } from '@/lib/night';
import { haptic } from '@/lib/prefs';
import { useToast } from '@/lib/toast';

export function Count() {
  const id = useQueryId();
  const { night, missing } = useNightLoader(id);
  const go = useGo();
  const status = night?.state.status;
  useEffect(() => {
    if (!night) return;
    if (status === 'live') go(`/app/s?id=${night.session.id}`, { replace: true });
    if (status === 'closed') go(`/app/s/settle?id=${night.session.id}`, { replace: true });
  }, [status, night, go]);
  if (missing) return null;
  if (!night || status !== 'counting') return <Loading />;
  return <CountScreen night={night} />;
}

function CountScreen({ night }: { night: Night }) {
  const t = useTranslations('count');
  const tc = useTranslations('common');
  const go = useGo();
  const show = useToast((s) => s.show);
  const { session, state, isHost } = night;
  const [editing, setEditing] = useState<StintState | null>(null);
  const [value, setValue] = useState(0);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [gapOpen, setGapOpen] = useState(false);
  const [backOpen, setBackOpen] = useState(false);
  const players = activeStints(state).sort((a, b) => a.seat - b.seat);
  const st = countStatus(state);
  const chipSet = session.config.chipSet;

  useEffect(() => {
    if (st.complete && st.gap !== 0) track('gap_found', { sign: st.gap < 0 ? 'missing' : 'extra' });
  }, [st.complete, st.gap]);

  function open(s: StintState) {
    if (!isHost) return;
    setEditing(s);
    setValue(s.final ?? 0);
    setBreakdown({});
  }

  async function save() {
    if (!editing) return;
    const r = await recordOne(session.id, 'FINAL_COUNT', {
      stintId: editing.id,
      finalChips: value,
      ...(chipSet ? { chipBreakdown: breakdown } : {}),
    });
    if (!r.ok) return show({ message: r.message, tone: 'error' });
    haptic();
    // Jump to the next uncounted player.
    const next = players.find((p) => p.id !== editing.id && p.final === null);
    if (next) open(next);
    else setEditing(null);
  }

  async function backToGame() {
    const r = await recordOne(session.id, 'COUNTING_REOPENED', {});
    if (!r.ok) return show({ message: r.message, tone: 'error' });
    go(`/app/s?id=${session.id}`, { replace: true });
  }

  const gapText = st.gap < 0 ? t('missing', { amount: formatINR(-st.gap) }) : t('extra', { amount: formatINR(st.gap) });

  return (
    <main className="pb-44">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-hairline bg-bg/95 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => (isHost ? setBackOpen(true) : go(`/app/s?id=${session.id}`))}>
          <ArrowLeft size={20} strokeWidth={1.5} aria-hidden /> {t('backToGame')}
        </Button>
        <h1 className="flex-1 text-right font-semibold">{t('title')}</h1>
        <SyncPill unsynced={night.unsynced} />
      </header>

      <ul className="space-y-2 px-4 pt-3">
        {players.map((s) => {
          const m = night.member(s.memberId);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => open(s)}
                disabled={!isHost}
                className="flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-card)] bg-surface-1 px-3 text-left shadow-[var(--key)]"
              >
                <Avatar name={m?.nickname ?? '?'} color={m?.color ?? 'sand'} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m?.nickname}</span>
                  <span className="block text-caption text-text-3">In {formatINR(derive(s).netChips)}</span>
                </span>
                <span className={cn('tnum text-amount font-semibold', s.final === null && 'text-[15px] font-normal text-text-3')}>
                  {s.final === null ? t('tapToCount') : formatINR(s.final)}
                </span>
                {s.adj !== 0 && <span className="tnum text-caption text-warn">⚠ {formatSigned(s.adj)}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Sticky reconciliation footer */}
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-hairline bg-bg/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
        <div aria-live="polite" className="mb-3">
          {!st.complete ? (
            <p className="tnum text-label text-text-2">
              {t('counted', { counted: formatINR(st.counted), expected: formatINR(st.expected) })} · {t('left', { count: st.uncounted })}
            </p>
          ) : st.gap === 0 ? (
            <p className="text-body font-semibold text-win">✅ {t('match', { amount: formatINR(st.counted) })}</p>
          ) : (
            <p className={cn('text-body font-semibold', st.gap < 0 ? 'text-loss' : 'text-warn')}>
              {st.gap < 0 ? '🔴' : '🟠'} {gapText}
            </p>
          )}
        </div>
        {st.complete && st.gap !== 0 && isHost ? (
          <Button variant="primary" size="lg" onClick={() => setGapOpen(true)}>
            {t('fixGap')}
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={!st.complete || st.gap !== 0} onClick={() => go(`/app/s/settle?id=${session.id}`)}>
            {t('settle')}
          </Button>
        )}
      </footer>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? night.nameOf(editing.memberId) : ''}>
        <div className="space-y-3">
          {chipSet ? (
            <>
              <ChipCounter chipSet={chipSet} counts={breakdown} onChange={(c, total) => (setBreakdown(c), setValue(total))} />
              <p className="tnum text-center text-amount font-semibold">{formatINR(value)}</p>
            </>
          ) : (
            <Keypad value={value} onChange={setValue} />
          )}
          <Button variant="primary" size="lg" onClick={save}>
            {tc('save')} · {formatINR(value)}
          </Button>
        </div>
      </Sheet>

      <Sheet open={backOpen} onClose={() => setBackOpen(false)} title={t('backToGame')}>
        <Button variant="primary" size="lg" onClick={backToGame}>
          {t('backToGame')}
        </Button>
      </Sheet>

      <GapSheet night={night} open={gapOpen} onClose={() => setGapOpen(false)} />
      <ToastHost bottom={140} />
    </main>
  );
}

/** Gap resolution (§8.9): recount, check the log, or accept an adjustment. */
function GapSheet({ night, open, onClose }: { night: Night; open: boolean; onClose: () => void }) {
  const t = useTranslations('count');
  const go = useGo();
  const show = useToast((s) => s.show);
  const [mode, setMode] = useState<'menu' | 'adjust'>('menu');
  const [resolution, setResolution] = useState<Resolution>('bank_absorbs');
  const [assignee, setAssignee] = useState<string | null>(null);
  const { state, session } = night;
  const st = countStatus(state);
  const players = activeStints(state).sort((a, b) => a.seat - b.seat);
  useEffect(() => {
    if (open) setMode('menu');
  }, [open]);

  const assignedStint = players.find((s) => s.memberId === assignee)?.id;
  let plan: { stintId: string; amount: number }[] = [];
  try {
    plan = resolution === 'assigned' && !assignedStint ? [] : planAdjustment(state, resolution, assignedStint);
  } catch {
    plan = [];
  }

  async function apply() {
    const r = await record(
      session.id,
      plan.map((p) => ({ type: 'ADJUSTMENT' as const, payload: { ...p, resolution, gapAtTime: st.gap } })),
    );
    if (!r.ok) return show({ message: r.message, tone: 'error' });
    haptic();
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={st.gap < 0 ? t('missing', { amount: formatINR(-st.gap) }) : t('extra', { amount: formatINR(st.gap) })}>
      {mode === 'menu' ? (
        <div className="space-y-2">
          <p className="mb-2 text-label text-text-2">{st.gap < 0 ? t('missingCauses') : t('extraCauses')}</p>
          <Button variant="surface" size="lg" onClick={onClose}>
            {t('recount')}
          </Button>
          <Button variant="surface" size="lg" onClick={() => go(`/app/s/log?id=${session.id}&filter=gap`)}>
            {t('checkLog')}
          </Button>
          <Button variant="outline" size="lg" onClick={() => setMode('adjust')}>
            {t('accept')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-1" role="radiogroup">
            {(['bank_absorbs', 'split_equal', 'assigned'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={resolution === r}
                onClick={() => setResolution(r)}
                className={cn('min-h-12 rounded-[var(--radius-btn)] border px-4 text-left', resolution === r ? 'border-flame bg-flame/10' : 'border-hairline-strong')}
              >
                {r === 'bank_absorbs' ? t('bankAbsorbs') : r === 'split_equal' ? t('splitEqual') : t('assigned')}
              </button>
            ))}
          </div>
          {resolution === 'assigned' && <MemberPick night={night} stints={players} value={assignee} onChange={setAssignee} />}
          {plan.length > 0 && (
            <div>
              <p className="mb-1 text-label text-text-2">{t('preview')}</p>
              <ul className="divide-y divide-hairline rounded-[var(--radius-btn)] border border-hairline">
                {players.map((s) => {
                  const a = plan.find((p) => p.stintId === s.id)?.amount ?? 0;
                  return (
                    <li key={s.id} className="tnum flex min-h-10 items-center justify-between px-3 text-label">
                      <span>{night.nameOf(s.memberId)}</span>
                      <span>
                        {formatINR((s.final ?? 0) + s.adj + a)}
                        {a !== 0 && <span className="ml-2 text-warn">⚠ {formatSigned(a)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <Button variant="primary" size="lg" disabled={!plan.length} onClick={apply}>
            {t('applyAdjust')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
