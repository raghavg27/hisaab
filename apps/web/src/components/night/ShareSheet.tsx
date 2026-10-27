'use client';
import { Button, Sheet } from '@hisaab/ui';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { rotateViewToken } from '@/lib/host';
import type { Night } from '@/lib/night';

export function viewUrl(token: string) {
  return `${location.origin}/v/${token}`;
}

/** Live view link: QR + WhatsApp (§8.7). Host can rotate or turn it off. */
export function ShareSheet({ night, open, onClose }: { night: Night; open: boolean; onClose: () => void }) {
  const t = useTranslations('share');
  const tc = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const { session } = night;
  const url = viewUrl(session.viewToken);

  async function copy() {
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotate(revoke: boolean) {
    setBusy(true);
    try {
      await rotateViewToken(session.id, revoke);
      setRevoked(revoke);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('title')}>
      <div className="space-y-3">
        <p className="text-label text-text-2">{t('body')}</p>
        {session.dirty ? <p className="text-caption text-warn">{t('needSync')}</p> : null}
        {revoked ? (
          <p className="text-text-2">{t('revoked')}</p>
        ) : (
          <div className="flex justify-center">
            <div className="rounded-[var(--radius-card)] bg-text p-3">
              <QRCodeSVG value={url} size={180} bgColor="#FFF7DD" fgColor="#0A0705" />
            </div>
          </div>
        )}
        <p className="truncate text-center font-mono text-caption text-text-3">{url}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copy}>
            {copied ? tc('copied') : t('copyLink')}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${session.title} · ${url}`)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-12 items-center justify-center rounded-[var(--radius-btn)] border border-hairline-strong px-4"
          >
            {t('whatsapp')}
          </a>
        </div>
        {night.isHost && !session.dirty && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" size="sm" disabled={busy || !navigator.onLine} onClick={() => rotate(false)}>
              {t('rotate')}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy || !navigator.onLine} onClick={() => rotate(true)}>
              {t('revoke')}
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
