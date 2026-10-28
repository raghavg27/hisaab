'use client';
import { activeStints, derive, tableTotals, type StintState } from '@hisaab/ledger';
import { Avatar, Button, Eyebrow, Keypad, Sheet, cn, formatINR, formatSigned } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { drainOutbox, transferHost } from '@/lib/host';
import { record, type Draft, type Night } from '@/lib/night';
import { haptic } from '@/lib/prefs';
import { useErrorText } from '@/lib/errors';
import { useToast } from '@/lib/toast';
import { ChipCounter } from './ChipCounter';

type Step = 'lastPlayer' | 'blockedHost' | 'count' | 'result' | 'partial' | 'bankCount' | 'bankHolder' | 'host';

/**
 * Leave table, settled on the spot (§8.6). When the leaver holds the bank and/or hosts,
 * this runs the combined wizard (§8.8): chips → settle → bank cash → new bank holder → new host.
 */
export function LeaveSheet({
  night,
  stint,
  onClose,
  onEndGame,
}: {
  night: Night;
  stint: StintState | null;
  onClose: () => void;
  onEndGame: () => void;
}) {
  const t = useTranslations('leave');
  const tb = useTranslations('bank');
  const th = useTranslations('host');
  const tc = useTranslations('common');
  const tl = useTranslations('live');
  const tm = useTranslations('combined');
  const show = useToast((s) => s.show);
  const errorText = useErrorText();
  const { state, session } = night;

  const [step, setStep] = useState<Step>('count');
  const [chips, setChips] = useState(0);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [settledNow, setSettledNow] = useState(0);
  const [partial, setPartial] = useState(0);
  const [bankCounted, setBankCounted] = useState(0);
  const [newBank, setNewBank] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const member = stint ? night.member(stint.memberId) : undefined;
  const name = member?.nickname ?? '';
  const isBank = !!stint && stint.memberId === state.bankHolderMemberId;
  const isHostLeaving = !!member?.userId && member.userId === session.hostUserId;
  const others = stint ? activeStints(state).filter((s) => s.id !== stint.id) : [];
  const { bankCash } = tableTotals(state.stints);
  const d = stint ? derive(stint) : null;
  const owes = d ? chips - d.shortOutstanding : 0;
  const pnl = d ? chips - d.netChips : 0;
  const chipSet = session.config.chipSet;

  useEffect(() => {
    if (!stint) return;
    setChips(0);
    setBreakdown({});
    setPartial(0);
    setNewBank(null);
    setError(null);
    setBusy(false);
    setStep(others.length === 1 ? 'lastPlayer' : isHostLeaving && !navigator.onLine ? 'blockedHost' : 'count');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stint?.id]);

  function afterSettle(amount: number) {
    setSettledNow(amount);
    if (isBank) {
      setBankCounted(bankCash - amount);
      setStep('bankCount');
    } else if (isHostLeaving) setStep('host');
    else void commit(amount, null, null);
  }

  async function commit(settled: number, bankTo: string | null, hostTo: string | null) {
    if (!stint) return;
    setBusy(true);
    setError(null);
    const drafts: Draft[] = [];
    if (bankTo)
      drafts.push({
        type: 'BANK_TRANSFERRED',
        payload: {
          fromMemberId: stint.memberId,
          toMemberId: bankTo,
          // Counted after the leaver's payout; the log compares against the bank before it.
          counted: Math.max(0, bankCounted + settled),
          expected: bankCash,
        },
      });
    drafts.push({
      type: 'PLAYER_LEFT',
      payload: { stintId: stint.id, finalChips: chips, settledNow: settled, ...(chipSet ? { chipBreakdown: breakdown } : {}) },
    });
    const r = await record(session.id, drafts);
    if (!r.ok) {
      setBusy(false);
      return setError(errorText(r));
    }
    if (hostTo) {
      const drained = await drainOutbox(session.id);
      if (drained !== 'ok') {
        setBusy(false);
        return setError(drained === 'offline' ? th('needOnline') : th('needSync', { count: 1 }));
      }
      try {
        await transferHost(session.id, hostTo);
      } catch (err) {
        setBusy(false);
        return setError(err instanceof Error ? err.message : String(err));
      }
    }
    haptic();
    show({ message: tl('toast.left', { name }), undo: hostTo ? undefined : { sessionId: session.id, eventIds: r.events.map((e) => e.id) } });
    onClose();
  }

  const title = isBank || isHostLeaving ? tm('title') : t('title', { name });
  const back = (to: Step) => (
    <Button variant="ghost" size="lg" disabled={busy} onClick={() => (setError(null), setStep(to))}>
      {tc('back')}
    </Button>
  );
  const loggedIn = others.filter((s) => {
    const m = night.member(s.memberId);
    return m?.userId && m.userId !== session.hostUserId;
  });

  return (
    <Sheet open={!!stint} onClose={onClose} title={title}>
      {stint && d && (
        <div className="space-y-3">
          {error && (
            <p role="alert" className="text-label text-loss">
              {error}
            </p>
          )}

          {step === 'lastPlayer' && (
            <>
              <p className="text-text-2">{tl('lastPlayer')}</p>
              <Button variant="primary" size="lg" onClick={onEndGame}>
                {tl('lastPlayerEnd')}
              </Button>
              <Button variant="ghost" size="lg" onClick={() => setStep(isHostLeaving && !navigator.onLine ? 'blockedHost' : 'count')}>
                {tl('lastPlayerLeave')}
              </Button>
            </>
          )}

          {step === 'blockedHost' && (
            <>
              <p className="text-text-2">{t('hostBlocked')}</p>
              <p className="text-label text-text-3">{th('needOnline')}</p>
              <Button variant="primary" size="lg" onClick={onEndGame}>
                {tl('endGame')}
              </Button>
            </>
          )}

          {step === 'count' && (
            <>
              {(isBank || isHostLeaving) && <Eyebrow>1 · {tm('s1')}</Eyebrow>}
              <p className="text-label text-text-2">{t('countChips', { name })}</p>
              {chipSet ? (
                <>
                  <ChipCounter chipSet={chipSet} counts={breakdown} onChange={(c, total) => (setBreakdown(c), setChips(total))} />
                  <p className="tnum text-center text-amount font-semibold">{formatINR(chips)}</p>
                </>
              ) : (
                <Keypad value={chips} onChange={setChips} label={t('countChips', { name })} />
              )}
              <Button variant="primary" size="lg" onClick={() => setStep('result')}>
                {t('next')}
              </Button>
            </>
          )}

          {step === 'result' && (
            <>
              {(isBank || isHostLeaving) && <Eyebrow>2 · {tm('s2')}</Eyebrow>}
              <div className="py-2 text-center">
                <p className="text-label text-text-2">{owes > 0 ? t('bankPays', { name }) : owes < 0 ? t('playerPays', { name }) : t('even')}</p>
                {owes !== 0 && <p className="tnum font-serif text-display leading-tight">{formatINR(Math.abs(owes))}</p>}
                <p className="mt-1 text-label text-text-3">
                  {t('pnl')}:{' '}
                  <span className={cn('tnum', pnl > 0 && 'text-win', pnl < 0 && 'text-loss')}>{formatSigned(pnl)}</span>
                </p>
              </div>
              {owes > bankCash ? (
                <>
                  <p role="alert" className="rounded-[var(--radius-btn)] border border-warn/40 p-3 text-label text-warn">
                    {t('bankShort', { bank: formatINR(Math.max(0, bankCash)), rest: formatINR(owes - Math.max(0, bankCash)) })}
                  </p>
                  <Button variant="primary" size="lg" disabled={busy} onClick={() => afterSettle(Math.max(0, bankCash))}>
                    {formatINR(Math.max(0, bankCash))} · {t('settlePart')}
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="lg" disabled={busy} onClick={() => afterSettle(owes)}>
                  {t('settled')}
                </Button>
              )}
              {owes !== 0 && (
                <Button variant="ghost" size="lg" onClick={() => (setPartial(0), setStep('partial'))}>
                  {t('settlePart')}
                </Button>
              )}
              {back('count')}
            </>
          )}

          {step === 'partial' && (
            <>
              <p className="text-label text-text-2">{t('partAmount')}</p>
              <Keypad value={partial} onChange={setPartial} />
              {partial <= Math.abs(owes) && (
                <p className="text-label text-text-3">{t('deferred', { amount: formatINR(Math.abs(owes) - partial) })}</p>
              )}
              <Button
                variant="primary"
                size="lg"
                disabled={busy || partial > Math.abs(owes) || (owes > 0 && partial > bankCash)}
                onClick={() => afterSettle(Math.sign(owes) * partial)}
              >
                {tc('confirm')} · {formatINR(partial)}
              </Button>
              {back('result')}
            </>
          )}

          {step === 'bankCount' && (
            <>
              <Eyebrow>3 · {tm('s3')}</Eyebrow>
              <p className="text-label text-text-2">{tb('handoverExpected', { amount: formatINR(bankCash - settledNow) })}</p>
              <Keypad value={bankCounted} onChange={setBankCounted} label={tb('counted')} />
              <Button variant="primary" size="lg" onClick={() => setStep('bankHolder')}>
                {t('next')}
              </Button>
              {back('result')}
            </>
          )}

          {step === 'bankHolder' && (
            <>
              <Eyebrow>4 · {tm('s4')}</Eyebrow>
              <MemberPick night={night} stints={others} value={newBank} onChange={setNewBank} />
              <Button
                variant="primary"
                size="lg"
                disabled={!newBank || busy}
                onClick={() => (isHostLeaving ? setStep('host') : void commit(settledNow, newBank, null))}
              >
                {isHostLeaving ? t('next') : tb('handover')}
              </Button>
              {back('bankCount')}
            </>
          )}

          {step === 'host' && (
            <>
              <Eyebrow>{isBank ? '5' : '3'} · {tm('s5')}</Eyebrow>
              {loggedIn.length ? (
                <HostPick night={night} stints={loggedIn} onPick={(userId) => void commit(settledNow, isBank ? newBank : null, userId)} busy={busy} />
              ) : (
                <>
                  <p className="text-label text-text-2">{th('noLoggedIn')}</p>
                  <Button variant="primary" size="lg" disabled={busy} onClick={() => void commit(settledNow, isBank ? newBank : null, null)}>
                    {tc('done')}
                  </Button>
                </>
              )}
              {back(isBank ? 'bankHolder' : 'result')}
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function MemberPick({
  night,
  stints,
  value,
  onChange,
}: {
  night: Night;
  stints: StintState[];
  value: string | null;
  onChange: (memberId: string) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2" role="radiogroup">
      {stints.map((s) => {
        const m = night.member(s.memberId);
        return (
          <li key={s.id}>
            <button
              type="button"
              role="radio"
              aria-checked={value === s.memberId}
              onClick={() => onChange(s.memberId)}
              className={cn(
                'flex min-h-12 w-full items-center gap-2 rounded-[var(--radius-btn)] border px-3',
                value === s.memberId ? 'border-flame bg-flame/10' : 'border-hairline-strong',
              )}
            >
              <Avatar name={m?.nickname ?? '?'} color={m?.color ?? 'sand'} size={28} />
              <span className="truncate">{m?.nickname}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function HostPick({ night, stints, onPick, busy }: { night: Night; stints: StintState[]; onPick: (userId: string) => void; busy: boolean }) {
  const th = useTranslations('host');
  const [pick, setPick] = useState<string | null>(null);
  const userOf = (memberId: string) => night.member(memberId)?.userId ?? null;
  return (
    <>
      <p className="text-label text-text-2">{th('pickMember')}</p>
      <MemberPick night={night} stints={stints} value={pick} onChange={setPick} />
      <Button variant="primary" size="lg" disabled={!pick || busy} onClick={() => pick && onPick(userOf(pick)!)}>
        {th('transfer')}
      </Button>
    </>
  );
}
