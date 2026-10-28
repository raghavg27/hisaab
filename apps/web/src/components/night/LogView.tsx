'use client';
import { VOIDABLE, type LedgerEvent, type LogEntry, type VoidReason } from '@hisaab/ledger';
import { Button, Keypad, Sheet, cn, formatINR } from '@hisaab/ui';
import { AlertTriangle, Crown, Landmark, Scale } from 'lucide-react';
import { ArrowLeft, Download } from '@/components/AnimatedIcon';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { Field } from '@/components/Field';
import { ToastHost } from '@/components/ToastHost';
import { describeEvent } from '@/lib/describe';
import { newId } from '@/lib/ids';
import { record, type Night } from '@/lib/night';
import { haptic } from '@/lib/prefs';
import { useErrorText } from '@/lib/errors';
import { useToast } from '@/lib/toast';

type Filter = 'all' | 'shorts' | 'topUps' | 'leaves' | 'fixes' | 'gap';

const MATCH: Record<Filter, (e: LedgerEvent, l: LogEntry) => boolean> = {
  all: () => true,
  shorts: (e) => e.type === 'SHORT_TAKEN' || e.type === 'SHORT_REPAID',
  topUps: (e) => e.type === 'TOP_UP' || e.type === 'BUY_IN',
  leaves: (e) => e.type === 'PLAYER_LEFT' || e.type === 'PLAYER_JOINED',
  fixes: (e, l) => e.type === 'EVENT_VOIDED' || e.type === 'ADJUSTMENT' || !!l.voided,
  // "Check the log" from a gap: the entries that usually explain one.
  gap: (e) => ['SHORT_TAKEN', 'SHORT_REPAID', 'PLAYER_LEFT', 'TOP_UP', 'BUY_IN'].includes(e.type),
};

const AMOUNT_TYPES = ['BUY_IN', 'TOP_UP', 'SHORT_TAKEN', 'SHORT_REPAID', 'FINAL_COUNT'] as const;

/** Full event log (§8.13): sentences, voided struck through with reasons, filters, fix/void, CSV. */
export function LogView({
  night,
  member,
  initialFilter = 'all',
  onBack,
}: {
  night: Night;
  member?: string | null;
  initialFilter?: Filter;
  onBack?: () => void;
}) {
  const t = useTranslations('log');
  const tc = useTranslations('common');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [target, setTarget] = useState<{ entry: LogEntry; mode: 'void' | 'fix' } | null>(null);
  const { state, members, session } = night;
  const userName = (userId: string) => members.find((m) => m.userId === userId)?.nickname ?? '—';
  const stintMember = (e: LedgerEvent) => {
    const id = (e.payload as { stintId?: string; memberId?: string }).stintId;
    if (!id) return (e.payload as { memberId?: string }).memberId;
    const st = state.stints.find((s) => s.id === id);
    if (st) return st.memberId;
    const join = state.log.find((l) => l.event.type === 'PLAYER_JOINED' && l.event.payload.stintId === id)?.event;
    return join?.type === 'PLAYER_JOINED' ? join.payload.memberId : undefined;
  };

  const entries = useMemo(
    () =>
      [...state.log]
        .reverse()
        .filter((l) => MATCH[filter](l.event, l))
        .filter((l) => !member || stintMember(l.event) === member),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.log, filter, member],
  );

  function exportCsv() {
    const rows = [['seq', 'time', 'type', 'entry', 'by', 'voided', 'void_reason']];
    for (const l of state.log) {
      rows.push([
        String(l.event.seq),
        l.event.clientTs,
        l.event.type,
        describeEvent(t, l.event, night),
        userName(l.event.actorUserId),
        l.voided ? 'yes' : '',
        l.voided?.reason ?? '',
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${session.title.replace(/[^\w -]/g, '')}-log.csv`;
    a.click();
  }

  return (
    <main className="pb-16">
      <header className="sticky top-0 z-20 border-b border-hairline bg-bg/95 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" aria-label={tc('back')} className="-ml-2 min-w-12" onClick={onBack ?? (() => history.back())}>
            <ArrowLeft size={20} strokeWidth={1.5} />
          </Button>
          <h1 className="flex-1 font-semibold">
            {t('title')}
            {member && ` · ${night.nameOf(member)}`}
          </h1>
          <Button variant="ghost" size="sm" onClick={exportCsv} aria-label={t('exportCsv')}>
            <Download size={18} strokeWidth={1.5} aria-hidden /> CSV
          </Button>
        </div>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4" role="tablist">
          {(['all', 'shorts', 'topUps', 'leaves', 'fixes'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn('min-h-10 shrink-0 rounded-full border px-4 text-label', filter === f ? 'border-flame text-text' : 'border-hairline-strong text-text-2')}
            >
              {t(f)}
            </button>
          ))}
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="rangoli m-4 rounded-[var(--radius-card)] border border-hairline p-6 text-center text-text-2">{t('empty')}</p>
      ) : (
        <ol className="divide-y divide-hairline px-4">
          {entries.map((l) => {
            const e = l.event;
            const canFix = night.isHost && !l.voided && state.status !== 'closed' && VOIDABLE.includes(e.type);
            const mismatch =
              (e.type === 'BANK_CHECK' || e.type === 'BANK_TRANSFERRED') && e.payload.counted !== e.payload.expected
                ? e.payload.counted - e.payload.expected
                : 0;
            return (
              <li key={e.id} className="py-3 [content-visibility:auto] [contain-intrinsic-size:auto_64px]">
                <div className="flex items-start gap-3">
                  <span className="tnum w-16 shrink-0 pt-0.5 text-caption text-text-3">
                    {new Date(e.clientTs).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('flex items-start gap-1.5', l.voided && 'text-text-3 line-through')}>
                      <EventIcon e={e} />
                      <span>{describeEvent(t, e, night)}</span>
                    </p>
                    <p className="text-caption text-text-3">
                      #{e.seq} · {t('by', { name: userName(e.actorUserId) })}
                      {l.voided && (
                        <span className="text-loss">
                          {' '}
                          · {t('voided', { reason: t(`reasons.${l.voided.reason}`) })}
                          {l.voided.note && !l.voided.note.startsWith('fix:') ? ` · ${l.voided.note}` : ''}
                        </span>
                      )}
                      {mismatch !== 0 && <span className="text-loss"> · {t('mismatch', { amount: formatINR(mismatch) })}</span>}
                    </p>
                  </div>
                  {canFix && (
                    <div className="flex shrink-0 gap-1">
                      {AMOUNT_TYPES.includes(e.type as (typeof AMOUNT_TYPES)[number]) && (
                        <Button variant="ghost" size="sm" onClick={() => setTarget({ entry: l, mode: 'fix' })}>
                          {t('fix')}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setTarget({ entry: l, mode: 'void' })}>
                        {t('void')}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <FixSheet night={night} target={target} onClose={() => setTarget(null)} />
      <ToastHost bottom={24} />
    </main>
  );
}

function EventIcon({ e }: { e: LedgerEvent }) {
  const cls = 'mt-0.5 shrink-0';
  if (e.type === 'ADJUSTMENT') return <AlertTriangle size={16} strokeWidth={1.5} className={cn(cls, 'text-warn')} aria-hidden />;
  if (e.type === 'BANK_CHECK') return <Scale size={16} strokeWidth={1.5} className={cn(cls, 'text-gold')} aria-hidden />;
  if (e.type === 'BANK_TRANSFERRED') return <Landmark size={16} strokeWidth={1.5} className={cn(cls, 'text-gold')} aria-hidden />;
  if (e.type === 'HOST_TRANSFERRED') return <Crown size={16} strokeWidth={1.5} className={cn(cls, 'text-gold')} aria-hidden />;
  return null;
}

/** Void (reason required), or Fix = EVENT_VOIDED + corrected event, linked by note "fix:<newId>". */
function FixSheet({ night, target, onClose }: { night: Night; target: { entry: LogEntry; mode: 'void' | 'fix' } | null; onClose: () => void }) {
  const t = useTranslations('log');
  const show = useToast((s) => s.show);
  const errorText = useErrorText();
  const [reason, setReason] = useState<VoidReason>('wrong_amount');
  const [note, setNote] = useState('');
  // null until edited, so clearing the keypad to 0 doesn't snap back to the old amount.
  const [edited, setAmount] = useState<number | null>(null);
  useEffect(() => setAmount(null), [target]);
  const e = target?.entry.event;
  const oldAmount = e && 'amount' in (e.payload as object) ? (e.payload as { amount: number }).amount : e?.type === 'FINAL_COUNT' ? e.payload.finalChips : 0;
  const amount = edited ?? oldAmount;

  async function submit() {
    if (!e || !target) return;
    if (target.mode === 'void') {
      const r = await record(night.session.id, [{ type: 'EVENT_VOIDED', payload: { targetId: e.id, reason, ...(note ? { note } : {}) } }]);
      if (!r.ok) return show({ message: errorText(r), tone: 'error' });
    } else {
      const newEventPayload =
        e.type === 'FINAL_COUNT' ? { ...e.payload, finalChips: amount } : { ...(e.payload as object), amount };
      const fixedId = newId();
      const r = await record(night.session.id, [
        { type: 'EVENT_VOIDED', payload: { targetId: e.id, reason: 'wrong_amount', note: `fix:${fixedId}` } },
        { id: fixedId, type: e.type, payload: newEventPayload } as Parameters<typeof record>[1][number],
      ]);
      if (!r.ok) return show({ message: errorText(r), tone: 'error' });
    }
    haptic();
    onClose();
  }

  return (
    <Sheet open={!!target} onClose={onClose} title={target?.mode === 'fix' ? t('fixTitle') : t('voidTitle')}>
      {e && (
        <div className="space-y-3">
          <p className="text-label text-text-2">{describeEvent(t, e, night)}</p>
          {target!.mode === 'void' ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-label text-text-2">{t('reason')}</span>
                <select
                  value={reason}
                  onChange={(ev) => setReason(ev.target.value as VoidReason)}
                  className="h-12 w-full rounded-[var(--radius-btn)] bg-well px-4 shadow-[var(--key-pressed)]"
                >
                  {(['wrong_amount', 'wrong_player', 'duplicate', 'undo', 'other'] as const).map((r) => (
                    <option key={r} value={r}>
                      {t(`reasons.${r}`)}
                    </option>
                  ))}
                </select>
              </label>
              <Field label={t('note')} value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={120} />
              <Button variant="danger" size="lg" onClick={submit}>
                {t('void')}
              </Button>
            </>
          ) : (
            <>
              <Keypad value={amount} onChange={setAmount} />
              <Button variant="primary" size="lg" disabled={!amount || amount === oldAmount} onClick={submit}>
                {t('fix')} · {formatINR(amount)}
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
