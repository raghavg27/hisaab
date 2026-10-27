'use client';
import { activeStints, tableTotals } from '@hisaab/ledger';
import { Button, Keypad, Sheet, formatINR } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { recordOne, type Night } from '@/lib/night';
import { haptic } from '@/lib/prefs';
import { useToast } from '@/lib/toast';
import { MemberPick } from './LeaveSheet';

/** Bank check (§8.12): non-blocking, logged with counted vs expected. */
export function BankCheckSheet({ night, open, onClose, onHandover }: { night: Night; open: boolean; onClose: () => void; onHandover: () => void }) {
  const t = useTranslations('bank');
  const show = useToast((s) => s.show);
  const expected = tableTotals(night.state.stints).bankCash;
  const [counted, setCounted] = useState(expected);
  useEffect(() => {
    if (open) setCounted(expected);
  }, [open, expected]);

  async function save() {
    const r = await recordOne(night.session.id, 'BANK_CHECK', { counted, expected });
    if (!r.ok) return show({ message: r.message, tone: 'error' });
    haptic();
    show({
      message: counted === expected ? `✓ ${t('match')}` : `${t('mismatch', { amount: formatINR(counted - expected) })}`,
      tone: counted === expected ? 'info' : 'error',
      undo: { sessionId: night.session.id, eventIds: r.events.map((e) => e.id) },
    });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('checkTitle')}>
      <div className="space-y-3">
        <p className="text-text-2">{t('shouldHold', { amount: formatINR(expected) })}</p>
        {night.isHost && (
          <>
            <Keypad value={counted} onChange={setCounted} label={t('counted')} />
            <Button variant="primary" size="lg" onClick={save}>
              {t('record')}
            </Button>
            <Button variant="ghost" size="lg" onClick={onHandover}>
              {t('handoverTitle')}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Hand over the bank (§8.8). Cash count required; a mismatch is shown, not blocking. */
export function BankHandoverSheet({ night, open, onClose }: { night: Night; open: boolean; onClose: () => void }) {
  const t = useTranslations('bank');
  const show = useToast((s) => s.show);
  const { state } = night;
  const expected = tableTotals(state.stints).bankCash;
  const [counted, setCounted] = useState(expected);
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setCounted(expected);
      setTo(null);
    }
  }, [open, expected]);
  const others = activeStints(state).filter((s) => s.memberId !== state.bankHolderMemberId);

  async function save() {
    if (!to || !state.bankHolderMemberId) return;
    const r = await recordOne(night.session.id, 'BANK_TRANSFERRED', {
      fromMemberId: state.bankHolderMemberId,
      toMemberId: to,
      counted,
      expected,
    });
    if (!r.ok) return show({ message: r.message, tone: 'error' });
    haptic();
    show({ message: `${t('handover')} → ${night.nameOf(to)}`, undo: { sessionId: night.session.id, eventIds: r.events.map((e) => e.id) } });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('handoverTitle')}>
      <div className="space-y-3">
        <p className="text-label text-text-2">{t('handoverExpected', { amount: formatINR(expected) })}</p>
        <Keypad value={counted} onChange={setCounted} label={t('counted')} />
        <p className="text-label text-text-2">{t('newHolder')}</p>
        <MemberPick night={night} stints={others} value={to} onChange={setTo} />
        <Button variant="primary" size="lg" disabled={!to} onClick={save}>
          {t('handover')}
        </Button>
      </div>
    </Sheet>
  );
}
