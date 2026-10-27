'use client';
import { activeStints, derive, tableTotals, type StintState } from '@hisaab/ledger';
import { AmountText, Avatar, Button, Sheet, cn, formatINR, formatSigned } from '@hisaab/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronDown, Lock, ScrollText, Share2, Unlock, UserPlus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loading } from '@/components/Splash';
import { ToastHost } from '@/components/ToastHost';
import { AmountSheet } from '@/components/night/AmountSheet';
import { BankCheckSheet, BankHandoverSheet } from '@/components/night/BankSheets';
import { HostHandoverSheet } from '@/components/night/HostSheets';
import { LeaveSheet } from '@/components/night/LeaveSheet';
import { PlayerCard } from '@/components/night/PlayerCard';
import { ShareSheet } from '@/components/night/ShareSheet';
import { SyncPill } from '@/components/night/SyncPill';
import { useNightLoader } from '@/components/night/useNightLoader';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { addMember } from '@/lib/groups';
import { acceptHost, forceTakeover } from '@/lib/host';
import { newId } from '@/lib/ids';
import { useGo, useQueryId } from '@/lib/nav';
import { record, recordOne, type Night } from '@/lib/night';
import { haptic } from '@/lib/prefs';
import { useSync } from '@/lib/sync';
import { describeEvent } from '@/lib/describe';
import { useToast } from '@/lib/toast';

type SheetState =
  | { kind: 'topUp' | 'short' | 'repay' | 'more' | 'leave'; stint: StintState }
  | { kind: 'addPlayer' | 'bank' | 'bankHandover' | 'host' | 'share' | 'end' }
  | null;

export function LiveTable() {
  const id = useQueryId();
  const { night, missing } = useNightLoader(id);
  const tc = useTranslations('common');
  if (missing) return <p className="p-6 text-text-2">{tc('notFound')}</p>;
  if (!night) return <Loading />;
  return <Table night={night} />;
}

function useElapsed(since: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(h);
  }, []);
  const m = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function Table({ night }: { night: Night }) {
  const t = useTranslations('live');
  const tc = useTranslations('common');
  const th = useTranslations('host');
  const go = useGo();
  const show = useToast((s) => s.show);
  const userId = useAuth((s) => s.userId);
  const { session, state, isHost } = night;
  const [sheet, setSheet] = useState<SheetState>(null);
  const [filterShorts, setFilterShorts] = useState(false);
  const [showLeft, setShowLeft] = useState(false);
  const [locked, setLocked] = useState(false);
  const elapsed = useElapsed(session.startedAt);
  const totals = tableTotals(state.stints);
  const active = activeStints(state);
  const left = state.stints.filter((s) => s.left);
  const buyIn = session.config.buyIn;
  const hostMember = night.members.find((m) => m.userId === session.hostUserId);
  const counting = session.status === 'counting' || state.status === 'counting';

  // Closed nights live on the settle screen.
  useEffect(() => {
    if (state.status === 'closed') go(`/app/s/settle?id=${session.id}`, { replace: true });
  }, [state.status, session.id, go]);

  const close = () => setSheet(null);

  async function act(drafts: Parameters<typeof record>[1], message: string) {
    const r = await record(session.id, drafts);
    if (!r.ok) return show({ message: r.message, tone: 'error' });
    haptic();
    for (const e of r.events) track('event_recorded', { type: e.type });
    show({ message, undo: { sessionId: session.id, eventIds: r.events.map((e) => e.id) } });
    close();
  }

  const name = (s: StintState) => night.nameOf(s.memberId);
  const shown = filterShorts ? active.filter((s) => derive(s).shortOutstanding > 0) : active;
  const current = sheet && 'stint' in sheet ? sheet.stint : null;

  return (
    <main className="pb-28">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-hairline bg-bg/95 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label={tc('back')} className="-ml-2 min-w-12" onClick={() => go('/app')}>
            <ArrowLeft size={20} strokeWidth={1.5} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{session.title}</h1>
            <p className="tnum text-caption text-text-3">{elapsed}</p>
          </div>
          <SyncPill unsynced={night.unsynced} />
          <Button variant="ghost" size="sm" aria-label={tc('share')} className="min-w-12" onClick={() => setSheet({ kind: 'share' })}>
            <Share2 size={20} strokeWidth={1.5} />
          </Button>
          {isHost && (
            <Button variant="ghost" size="sm" aria-label={t('lock')} className="min-w-12" onClick={() => setLocked(true)}>
              <Lock size={20} strokeWidth={1.5} />
            </Button>
          )}
        </div>

        {/* Summary strip */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label={t('bank')} value={totals.bankCash} onClick={() => setSheet({ kind: 'bank' })} />
          <Stat label={t('onTable')} value={totals.chipsOnTable} />
          <Stat
            label={t('shortsOut')}
            value={totals.shortsOut}
            tone={totals.shortsOut > 0 ? 'short' : undefined}
            onClick={() => setFilterShorts((f) => !f)}
            pressed={filterShorts}
          />
        </div>
      </header>

      <div className="px-4 pt-3">
        <HostNotices night={night} />
        {!isHost && <p className="mb-3 rounded-[var(--radius-btn)] border border-hairline p-3 text-label text-text-2">{t('readOnly')}</p>}
        {counting && (
          <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-btn)] border border-flame/40 p-3">
            <p className="flex-1 text-label">{t('countingLocked')}</p>
            <Button variant="primary" size="sm" onClick={() => go(`/app/s/count?id=${session.id}`)}>
              {t('backToCount')}
            </Button>
          </div>
        )}
        {filterShorts && (
          <button type="button" className="mb-2 text-label text-flame" onClick={() => setFilterShorts(false)}>
            {t('filterShorts')} · {t('clearFilter')}
          </button>
        )}

        <motion.ul layout className="space-y-2" aria-label={tc('players', { count: active.length })}>
          <AnimatePresence initial={false}>
            {shown.map((s) => (
              <PlayerCard
                key={s.id}
                stint={s}
                member={night.member(s.memberId)}
                isBank={s.memberId === state.bankHolderMemberId}
                isHost={night.member(s.memberId)?.userId === session.hostUserId}
                canAct={isHost && !counting}
                onTopUp={() => setSheet({ kind: 'topUp', stint: s })}
                onShort={() => setSheet({ kind: 'short', stint: s })}
                onMore={() => setSheet({ kind: 'more', stint: s })}
              />
            ))}
          </AnimatePresence>
        </motion.ul>

        {session.config.kitty && <KittyChecklist night={night} />}

        {left.length > 0 && (
          <section className="mt-6">
            <button
              type="button"
              onClick={() => setShowLeft((v) => !v)}
              aria-expanded={showLeft}
              className="flex min-h-12 w-full items-center gap-2 text-label text-text-2"
            >
              <ChevronDown size={18} strokeWidth={1.5} className={cn('transition-transform', showLeft && 'rotate-180')} aria-hidden />
              {t('left')} · {left.length}
            </button>
            {showLeft && (
              <ul className="space-y-2">
                {left.map((s) => {
                  const m = night.member(s.memberId);
                  const d = derive(s);
                  const rejoinable = !active.some((a) => a.memberId === s.memberId) && left.findLast((x) => x.memberId === s.memberId) === s;
                  return (
                    <li key={s.id} className="flex min-h-14 items-center gap-3 rounded-[var(--radius-card)] border border-hairline px-3 py-2">
                      <Avatar name={m?.nickname ?? '?'} color={m?.color ?? 'sand'} size={32} className="opacity-70" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{m?.nickname}</p>
                        <p className={cn('tnum text-caption', (d.pnl ?? 0) > 0 ? 'text-win' : (d.pnl ?? 0) < 0 ? 'text-loss' : 'text-text-3')}>
                          {formatSigned(d.pnl ?? 0)}
                          {d.deferred !== 0 && <span className="text-text-3"> · {formatSigned(d.deferred)} later</span>}
                        </p>
                      </div>
                      {isHost && !counting && rejoinable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const stintId = newId();
                            void act(
                              [
                                { type: 'PLAYER_JOINED', payload: { stintId, memberId: s.memberId } },
                                { type: 'BUY_IN', payload: { stintId, amount: buyIn } },
                              ],
                              t('toast.joined', { name: m?.nickname ?? '', amount: formatINR(buyIn) }),
                            );
                          }}
                        >
                          {t('rejoin')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {hostMember && <p className="mt-6 text-center text-caption text-text-3">👑 {hostMember.nickname}</p>}
      </div>

      {/* Bottom action bar */}
      {isHost && !counting && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-[480px] grid-cols-[1fr_1fr_1.4fr] gap-2 border-t border-hairline bg-bg/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
          <Button variant="surface" onClick={() => setSheet({ kind: 'addPlayer' })}>
            <UserPlus size={18} strokeWidth={1.5} aria-hidden /> {t('addPlayer')}
          </Button>
          <Button variant="surface" onClick={() => go(`/app/s/log?id=${session.id}`)}>
            <ScrollText size={18} strokeWidth={1.5} aria-hidden /> {t('log')}
          </Button>
          <Button variant="primary" onClick={() => setSheet({ kind: 'end' })}>
            {t('endGame')}
          </Button>
        </nav>
      )}
      {!isHost && (
        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-hairline bg-bg/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <Button variant="surface" size="lg" onClick={() => go(`/app/s/log?id=${session.id}`)}>
            <ScrollText size={18} strokeWidth={1.5} aria-hidden /> {t('log')}
          </Button>
        </nav>
      )}

      {/* Sheets */}
      <AmountSheet
        open={sheet?.kind === 'topUp'}
        onClose={close}
        title={current ? t('topUpTitle', { name: name(current) }) : ''}
        initial={session.config.topUp}
        buyIn={buyIn}
        describe={(a) => (current ? t('topUpBody', { name: name(current), amount: formatINR(a) }) : '')}
        onConfirm={(amount) =>
          current &&
          act([{ type: 'TOP_UP', payload: { stintId: current.id, amount } }], t('toast.topUp', { name: name(current), amount: formatINR(amount) }))
        }
      />
      <AmountSheet
        open={sheet?.kind === 'short'}
        onClose={close}
        title={current ? t('shortTitle', { name: name(current) }) : ''}
        initial={null}
        quick={[
          { label: formatINR(100), value: 100 },
          { label: formatINR(200), value: 200 },
          { label: `${tc('buyIn')}`, value: buyIn },
        ]}
        buyIn={buyIn}
        describe={(a) => (current ? t('shortBody', { name: name(current), amount: formatINR(a) }) : '')}
        onConfirm={(amount) =>
          current &&
          act([{ type: 'SHORT_TAKEN', payload: { stintId: current.id, amount } }], t('toast.short', { name: name(current), amount: formatINR(amount) }))
        }
      />
      <RepaySheet night={night} stint={sheet?.kind === 'repay' ? sheet.stint : null} onClose={close} act={act} />
      <MoreSheet
        night={night}
        stint={sheet?.kind === 'more' ? sheet.stint : null}
        onClose={close}
        onRepay={(s) => setSheet({ kind: 'repay', stint: s })}
        onLeave={(s) => setSheet({ kind: 'leave', stint: s })}
      />
      <LeaveSheet
        night={night}
        stint={sheet?.kind === 'leave' ? sheet.stint : null}
        onClose={close}
        onEndGame={() => setSheet({ kind: 'end' })}
      />
      <AddPlayerSheet night={night} open={sheet?.kind === 'addPlayer'} onClose={close} act={act} />
      <BankCheckSheet night={night} open={sheet?.kind === 'bank'} onClose={close} onHandover={() => setSheet({ kind: 'bankHandover' })} />
      <BankHandoverSheet night={night} open={sheet?.kind === 'bankHandover'} onClose={close} />
      <HostHandoverSheet night={night} open={sheet?.kind === 'host'} onClose={close} />
      <ShareSheet night={night} open={sheet?.kind === 'share'} onClose={close} />
      <Sheet open={sheet?.kind === 'end'} onClose={close} title={t('endGameTitle')}>
        <div className="space-y-3">
          <p className="text-text-2">{t('endGameBody')}</p>
          <Button
            variant="primary"
            size="lg"
            onClick={async () => {
              const r = await recordOne(session.id, 'COUNTING_STARTED', {});
              if (!r.ok) return show({ message: r.message, tone: 'error' });
              haptic();
              close();
              go(`/app/s/count?id=${session.id}`);
            }}
          >
            {t('startCounting')}
          </Button>
          {isHost && (
            <Button variant="ghost" size="lg" onClick={() => setSheet({ kind: 'host' })}>
              {th('handoverTitle')}
            </Button>
          )}
        </div>
      </Sheet>

      <ToastHost />
      {locked && <TableLock onUnlock={() => setLocked(false)} />}
      {userId && <HandoverAccept night={night} />}
    </main>
  );
}

function Stat({
  label,
  value,
  onClick,
  tone,
  pressed,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  tone?: 'short';
  pressed?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick && pressed !== undefined ? pressed : undefined}
      className={cn(
        'flex min-h-14 flex-col items-start justify-center rounded-[var(--radius-btn)] px-3 py-1.5 text-left',
        onClick ? 'bg-surface-1 shadow-[var(--key)] active:shadow-[var(--key-pressed)]' : 'border border-hairline',
        pressed && 'outline outline-1 outline-short/60',
      )}
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-gold">{label}</span>
      <AmountText value={value} className={cn('text-body font-semibold', tone === 'short' && 'text-short')} />
    </Tag>
  );
}

function RepaySheet({
  night,
  stint,
  onClose,
  act,
}: {
  night: Night;
  stint: StintState | null;
  onClose: () => void;
  act: (drafts: Parameters<typeof record>[1], message: string) => Promise<void>;
}) {
  const t = useTranslations('live');
  const [method, setMethod] = useState<'cash' | 'chips'>('cash');
  const out = stint ? derive(stint).shortOutstanding : 0;
  const name = stint ? night.nameOf(stint.memberId) : '';
  useEffect(() => setMethod('cash'), [stint?.id]);
  return (
    <AmountSheet
      open={!!stint}
      onClose={onClose}
      title={t('repayTitle', { name })}
      initial={out}
      max={out}
      quick={[
        { label: t('full'), value: out },
        { label: t('half'), value: Math.floor(out / 2) },
      ].filter((q) => q.value > 0)}
      buyIn={night.session.config.buyIn}
      describe={(a) =>
        method === 'cash' ? t('repayCashBody', { name, amount: formatINR(a) }) : t('repayChipsBody', { name, amount: formatINR(a) })
      }
      onConfirm={(amount) =>
        stint &&
        act([{ type: 'SHORT_REPAID', payload: { stintId: stint.id, amount, method } }], t('toast.repay', { name, amount: formatINR(amount) }))
      }
    >
      <p className="text-label text-text-3">{t('outstanding', { amount: formatINR(out) })}</p>
      <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-btn)] bg-well p-1" role="radiogroup">
        {(['cash', 'chips'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={cn('min-h-11 rounded-[10px] text-label', method === m ? 'bg-surface-2 shadow-[var(--key)]' : 'text-text-2')}
          >
            {m === 'cash' ? t('repayCash') : t('repayChips')}
          </button>
        ))}
      </div>
    </AmountSheet>
  );
}

function MoreSheet({
  night,
  stint,
  onClose,
  onRepay,
  onLeave,
}: {
  night: Night;
  stint: StintState | null;
  onClose: () => void;
  onRepay: (s: StintState) => void;
  onLeave: (s: StintState) => void;
}) {
  const t = useTranslations('live');
  const go = useGo();
  if (!stint) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const out = derive(stint).shortOutstanding;
  return (
    <Sheet open={!!stint} onClose={onClose} title={night.nameOf(stint.memberId)}>
      <div className="grid gap-2">
        <Button variant="surface" size="lg" disabled={out <= 0} onClick={() => onRepay(stint)}>
          {t('repay')} {out > 0 && `· ${formatINR(out)}`}
        </Button>
        <Button variant="surface" size="lg" onClick={() => onLeave(stint)}>
          {t('leave')}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => go(`/app/s/log?id=${night.session.id}&member=${stint.memberId}`)}>
          {t('playerLog')}
        </Button>
      </div>
    </Sheet>
  );
}

function AddPlayerSheet({
  night,
  open,
  onClose,
  act,
}: {
  night: Night;
  open: boolean;
  onClose: () => void;
  act: (drafts: Parameters<typeof record>[1], message: string) => Promise<void>;
}) {
  const t = useTranslations('live');
  const tw = useTranslations('wizard');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const atTable = new Set(activeStints(night.state).map((s) => s.memberId));
  const everPlayed = new Set(night.state.stints.map((s) => s.memberId));
  // Members who never sat down tonight; returning players use Rejoin.
  const available = night.members.filter((m) => !atTable.has(m.id) && !everPlayed.has(m.id) && !m.archivedAt);
  const buyIn = night.session.config.buyIn;

  function join(memberId: string, nickname: string) {
    const stintId = newId();
    void act(
      [
        { type: 'PLAYER_JOINED', payload: { stintId, memberId } },
        { type: 'BUY_IN', payload: { stintId, amount: buyIn } },
      ],
      t('toast.joined', { name: nickname, amount: formatINR(buyIn) }),
    );
  }

  async function addNew(e: React.FormEvent) {
    e.preventDefault();
    try {
      const m = await addMember(night.session.groupId, name);
      setName('');
      join(m.id, m.nickname);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('addPlayerTitle')}>
      <div className="space-y-3">
        <p className="text-label text-text-2">{t('addPlayerBody', { amount: formatINR(buyIn) })}</p>
        {available.length ? (
          <ul className="flex flex-wrap gap-2">
            {available.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => join(m.id, m.nickname)}
                  className="flex min-h-12 items-center gap-2 rounded-full border border-hairline-strong py-1 pr-4 pl-1"
                >
                  <Avatar name={m.nickname} color={m.color} size={32} />
                  {m.nickname}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-caption text-text-3">{t('nobodyToAdd')}</p>
        )}
        <form onSubmit={addNew} className="flex gap-2">
          <input
            aria-label={tw('addPerson')}
            placeholder={tw('addPersonPlaceholder')}
            value={name}
            onChange={(e) => (setName(e.target.value), setError(null))}
            className="h-12 min-w-0 flex-1 rounded-[var(--radius-btn)] bg-well px-4 shadow-[var(--key-pressed)] placeholder:text-text-3"
          />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            {tw('addPerson')}
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-caption text-loss">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function KittyChecklist({ night }: { night: Night }) {
  const t = useTranslations('live');
  const show = useToast((s) => s.show);
  const kitty = night.session.config.kitty!;
  const people = [...new Set(night.state.stints.map((s) => s.memberId))];
  const paid = people.filter((m) => night.state.kittyPaid[m]).length;
  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-hairline p-3">
      <p className="mb-2 text-label text-text-2">
        {t('kittyTitle', { paid, total: people.length })} · {formatINR(kitty.amount)} → {night.nameOf(kitty.holderMemberId)}
      </p>
      <ul className="flex flex-wrap gap-2">
        {people.map((m) => {
          const on = !!night.state.kittyPaid[m];
          return (
            <li key={m}>
              <button
                type="button"
                aria-pressed={on}
                disabled={!night.isHost}
                onClick={async () => {
                  const r = await recordOne(night.session.id, 'KITTY_MARKED', { memberId: m, paid: !on });
                  if (!r.ok) show({ message: r.message, tone: 'error' });
                }}
                className={cn('min-h-10 rounded-full border px-3 text-label', on ? 'border-win/50 text-win' : 'border-hairline-strong text-text-2')}
              >
                {on ? '✓ ' : ''}
                {night.nameOf(m)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Stray-tap guard: unlock with a 1-second long-press. */
function TableLock({ onUnlock }: { onUnlock: () => void }) {
  const t = useTranslations('live');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const start = () => {
    setHolding(true);
    timer.current = setTimeout(() => {
      haptic();
      onUnlock();
    }, 1000);
  };
  const stop = () => {
    setHolding(false);
    if (timer.current) clearTimeout(timer.current);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(10_7_5/0.35)] pb-[max(24px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
        className="relative flex min-h-14 items-center gap-2 overflow-hidden rounded-full border border-hairline-strong bg-surface-2 px-6 text-label select-none"
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-flame/25"
          style={{ width: holding ? '100%' : '0%', transition: holding ? 'width 1s linear' : 'width 0.15s' }}
        />
        <Unlock size={18} strokeWidth={1.5} aria-hidden className="relative" />
        <span className="relative">{t('locked')}</span>
      </button>
    </div>
  );
}

/** Host-side notices: this device lost hosting (with refused entries), or force takeover for admins. */
function HostNotices({ night }: { night: Night }) {
  const t = useTranslations('live');
  const th = useTranslations('host');
  const tl = useTranslations('log');
  const lost = useSync((s) => s.lostHost.includes(night.session.id));
  const rejected = useLiveQuery(() => db.rejected.where('sessionId').equals(night.session.id).toArray(), [night.session.id]);
  const userId = useAuth((s) => s.userId);
  const me = night.members.find((m) => m.userId === userId);
  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const silentMin = night.session.hostLastSeenAt ? Math.floor((now - new Date(night.session.hostLastSeenAt).getTime()) / 60_000) : 999;

  return (
    <>
      {(lost || (rejected?.length ?? 0) > 0) && rejected && rejected.length > 0 && (
        <section role="alert" className="mb-3 rounded-[var(--radius-btn)] border border-loss/40 p-3">
          <p className="mb-2 text-label text-loss">{t('rejectedTitle', { count: rejected.length })}</p>
          <ul className="mb-2 space-y-1 text-caption text-text-2">
            {rejected.map((r) => {
              return (
                <li key={r.id}>
                  {describeEvent(tl, r.event, night)}
                </li>
              );
            })}
          </ul>
          <p className="mb-2 text-caption text-text-3">{t('rejectedHint')}</p>
          <Button variant="ghost" size="sm" onClick={() => db.rejected.where('sessionId').equals(night.session.id).delete()}>
            {t('dismiss')}
          </Button>
        </section>
      )}
      {!night.isHost && isAdmin && night.session.status !== 'closed' && (
        <section className="mb-3 rounded-[var(--radius-btn)] border border-hairline p-3">
          <p className="mb-2 text-label text-text-2">
            {silentMin >= 10 ? th('takeOverBody', { minutes: silentMin }) : th('takeOverWait', { minutes: silentMin })}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={silentMin < 10}
            onClick={async () => {
              try {
                await forceTakeover(night.session.id);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            {th('takeOver')}
          </Button>
          {error && <p className="mt-2 text-caption text-loss">{error}</p>}
        </section>
      )}
    </>
  );
}

/** New host scanned the handover QR: /app/s?id=…&handover=CODE */
function HandoverAccept({ night }: { night: Night }) {
  const th = useTranslations('host');
  const code = useSearchParams().get('handover');
  const go = useGo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = !!code && !night.isHost;
  return (
    <Sheet open={open} onClose={() => go(`/app/s?id=${night.session.id}`, { replace: true })} title={th('acceptTitle')}>
      <div className="space-y-3">
        <p className="text-text-2">{th('acceptBody')}</p>
        <Button
          variant="primary"
          size="lg"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await acceptHost(night.session.id, code!);
              go(`/app/s?id=${night.session.id}`, { replace: true });
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {th('accept')}
        </Button>
        {error && <p className="text-caption text-loss">{error}</p>}
      </div>
    </Sheet>
  );
}
