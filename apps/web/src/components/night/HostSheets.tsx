'use client';
import dynamic from 'next/dynamic';
import { activeStints } from '@hisaab/ledger';
import { Button, Sheet } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { drainOutbox, offerHost, transferHost } from '@/lib/host';
import type { Night } from '@/lib/night';
import { useToast } from '@/lib/toast';
import { MemberPick } from './LeaveSheet';

// Only needed once the sheet shows a QR, so keep it out of the Live Table bundle.
const QRCodeSVG = dynamic(() => import('qrcode.react').then((m) => m.QRCodeSVG), { ssr: false });

/** Hand over hosting (§8.8): pick a logged-in player, or show a QR they scan while logged in. */
export function HostHandoverSheet({ night, open, onClose }: { night: Night; open: boolean; onClose: () => void }) {
  const t = useTranslations('host');
  const show = useToast((s) => s.show);
  const [pick, setPick] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'syncing' | 'offline' | 'busy'>('idle');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { session } = night;
  const candidates = activeStints(night.state).filter((s) => {
    const m = night.member(s.memberId);
    return m?.userId && m.userId !== session.hostUserId;
  });

  useEffect(() => {
    if (!open) return;
    setPick(null);
    setQr(null);
    setError(null);
    setStatus('syncing');
    void drainOutbox(session.id).then((r) => setStatus(r === 'ok' ? 'idle' : r === 'offline' ? 'offline' : 'syncing'));
  }, [open, session.id]);

  async function transfer() {
    const userId = pick && night.member(pick)?.userId;
    if (!userId) return;
    setStatus('busy');
    try {
      await transferHost(session.id, userId);
      show({ message: t('done', { name: night.nameOf(pick) }) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('idle');
    }
  }

  async function showQr() {
    try {
      const code = await offerHost(session.id);
      setQr(`${location.origin}/app/s?id=${session.id}&handover=${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('handoverTitle')}>
      <div className="space-y-3">
        {status === 'offline' ? (
          <p className="text-text-2">{t('needOnline')}</p>
        ) : status === 'syncing' ? (
          <p className="text-text-2">{t('needSync', { count: night.unsynced })}</p>
        ) : (
          <>
            {candidates.length ? (
              <>
                <p className="text-label text-text-2">{t('pickMember')}</p>
                <MemberPick night={night} stints={candidates} value={pick} onChange={setPick} />
                <Button variant="primary" size="lg" disabled={!pick || status === 'busy'} onClick={transfer}>
                  {t('transfer')}
                </Button>
              </>
            ) : (
              <p className="text-label text-text-2">{t('noLoggedIn')}</p>
            )}
            <div className="border-t border-hairline pt-3">
              <p className="mb-2 text-label text-text-2">{t('orScan')}</p>
              {qr ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-[var(--radius-card)] bg-text p-3">
                    <QRCodeSVG value={qr} size={180} bgColor="#FFF7DD" fgColor="#0A0705" />
                  </div>
                  <p className="text-center text-caption text-text-3">{t('scanHint')}</p>
                </div>
              ) : (
                <Button variant="outline" size="lg" onClick={showQr}>
                  QR
                </Button>
              )}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-label text-loss">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
