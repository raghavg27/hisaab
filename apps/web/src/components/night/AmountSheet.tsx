'use client';
import { Button, Keypad, Sheet, cn, formatINR } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { TYPO_MULTIPLE } from '@/lib/config';

/**
 * Confirm-an-amount sheet: quick amounts, optional custom keypad, and the typo guard
 * (> 5 × buy-in asks again).
 */
export function AmountSheet({
  open,
  onClose,
  title,
  initial,
  quick,
  buyIn,
  describe,
  confirmLabel,
  onConfirm,
  max,
  children,
  keypadFirst = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  initial: number | null;
  quick?: { label: string; value: number }[];
  buyIn: number;
  describe?: (amount: number) => ReactNode;
  confirmLabel?: string;
  onConfirm: (amount: number) => unknown;
  max?: number;
  children?: ReactNode;
  keypadFirst?: boolean;
}) {
  const t = useTranslations('live');
  const tc = useTranslations('common');
  const [amount, setAmount] = useState(initial ?? 0);
  const [custom, setCustom] = useState(keypadFirst);
  const [guard, setGuard] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount(initial ?? 0);
      setCustom(keypadFirst || (initial === null && !quick?.length));
      setGuard(false);
      setBusy(false);
    }
  }, [open, initial, keypadFirst, quick?.length]);

  async function confirm() {
    if (amount <= 0) return;
    if (!guard && amount > TYPO_MULTIPLE * buyIn) return setGuard(true);
    setBusy(true);
    await onConfirm(amount);
    setBusy(false);
  }

  const over = max !== undefined && amount > max;

  return (
    <Sheet open={open} onClose={onClose} title={guard ? t('typoTitle', { amount: formatINR(amount) }) : title}>
      {guard ? (
        <div className="space-y-3">
          <p className="text-text-2">{t('typoBody', { n: Math.round((amount / buyIn) * 10) / 10 })}</p>
          <Button variant="primary" size="lg" onClick={confirm} disabled={busy}>
            {t('yesRecord')}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setGuard(false)}>
            {tc('back')}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {children}
          {quick && quick.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {quick.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => (setAmount(q.value), setCustom(false))}
                  aria-pressed={!custom && amount === q.value}
                  className={cn(
                    'tnum min-h-12 rounded-[var(--radius-btn)] border text-label',
                    !custom && amount === q.value ? 'border-flame bg-flame/10' : 'border-hairline-strong text-text-2',
                  )}
                >
                  {q.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => (setCustom(true), setAmount(0))}
                aria-pressed={custom}
                className={cn(
                  'min-h-12 rounded-[var(--radius-btn)] border text-label',
                  custom ? 'border-flame bg-flame/10' : 'border-hairline-strong text-text-2',
                )}
              >
                {tc('custom')}
              </button>
            </div>
          )}
          {custom ? (
            <Keypad value={amount} onChange={setAmount} />
          ) : (
            <p className="tnum py-2 text-center font-serif text-display leading-none">{formatINR(amount)}</p>
          )}
          {describe && amount > 0 && <p className="text-center text-label text-text-2">{describe(amount)}</p>}
          <Button variant="primary" size="lg" onClick={confirm} disabled={busy || amount <= 0 || over}>
            {confirmLabel ?? tc('confirm')} · {formatINR(amount)}
          </Button>
        </div>
      )}
    </Sheet>
  );
}
