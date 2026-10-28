'use client';
import { derive, nightResults, settlement, transferKey, type MemberResult } from '@hisaab/ledger';
import { Avatar, Button, Eyebrow, Sheet, cn, formatINR, formatSigned } from '@hisaab/ui';
import { ScrollText } from 'lucide-react';
import { ArrowLeft, ChevronDown } from '@/components/AnimatedIcon';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/Field';
import { ToastHost } from '@/components/ToastHost';
import { durationBucket, track } from '@/lib/analytics';
import { getMeta, setMeta } from '@/lib/db';
import { unsyncedCount } from '@/lib/host';
import { useGo } from '@/lib/nav';
import { recordOne, type Night } from '@/lib/night';
import { haptic } from '@/lib/prefs';
import { durationText, kittyStatus, shareText } from '@/lib/share';
import { useErrorText } from '@/lib/errors';
import { useToast } from '@/lib/toast';
import { maybeOfferInstall } from '@/components/InstallPrompt';
import { ShareCard, shareCardPng } from './ShareCard';
import { viewUrl } from './ShareSheet';
import { SyncPill } from './SyncPill';

const Reveal = dynamic(() => import('./Reveal').then((m) => m.Reveal), { ssr: false });

const TITLE_ICON = { raja: '👑', comeback: '🪔', steady: '🎯', short_king: '🧾' } as const;

/** Reveal + results + who pays whom + share + close (§8.10). Also used read-only by viewers. */
export function SettlementView({ night, viewer = false }: { night: Night; viewer?: boolean }) {
  const t = useTranslations('settle');
  const tc = useTranslations('common');
  const tl = useTranslations('live');
  const go = useGo();
  const show = useToast((s) => s.show);
  const errorText = useErrorText();
  const { session, state, nameOf } = night;
  const canEdit = night.isHost && !viewer;
  const closed = state.status === 'closed';
  const results = nightResults(state, nameOf);
  const st = settlement(state, nameOf);
  const [view, setView] = useState<'fewest' | 'bank'>('fewest');
  const [open, setOpen] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Reveal plays once per night per device.
  useEffect(() => {
    void getMeta<boolean>(`revealed:${session.id}`).then((seen) => {
      if (!seen) {
        setReveal(true);
        void setMeta(`revealed:${session.id}`, true);
      }
    });
  }, [session.id]);

  const holder = st.bankHolderMemberId;
  const rows =
    view === 'fewest'
      ? st.transfers.map((x) => ({ from: x.from, to: x.to, amount: x.amount, label: `${nameOf(x.from)} → ${nameOf(x.to)}` }))
      : st.viaBank.map((v) =>
          v.amount > 0
            ? { from: holder, to: v.memberId, amount: v.amount, label: t('bankPays', { holder: nameOf(holder), name: nameOf(v.memberId) }) }
            : { from: v.memberId, to: holder, amount: -v.amount, label: t('paysBank', { holder: nameOf(holder), name: nameOf(v.memberId) }) },
        );
  const isPaid = (r: { from: string; to: string; amount: number }) => {
    const m = state.transferMarks[transferKey(r.from, r.to)];
    return !!m && m.paid && m.amount === r.amount;
  };
  const done = rows.filter(isPaid).length;

  const shortsCount = state.stints.reduce((a, s) => a + s.shortsCount, 0);
  const chipsIssued = state.stints.reduce((a, s) => a + derive(s).chipsIssued, 0);
  const kitty = kittyStatus(state);
  const people = new Set(state.stints.map((s) => s.memberId)).size;
  const bankMismatch = state.bankTransfers.filter((b) => b.payload.counted !== b.payload.expected);
  const url = session.dirty ? null : viewUrl(session.viewToken);

  async function mark(r: { from: string; to: string; amount: number }, paid: boolean) {
    const res = await recordOne(session.id, 'TRANSFER_MARKED', { from: r.from, to: r.to, amount: r.amount, paid });
    if (!res.ok) show({ message: errorText(res), tone: 'error' });
    else haptic();
  }

  const text = () =>
    shareText({ title: session.title, state, nameOf, startedAt: session.startedAt, endedAt: state.closedAt ?? null, viewUrl: url });

  async function shareWhatsapp() {
    const body = text();
    if (navigator.share) {
      try {
        await navigator.share({ text: body });
        return;
      } catch {
        // fall through to wa.me
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
  }

  async function shareImage() {
    if (!cardRef.current) return;
    const file = await shareCardPng(cardRef.current, `${session.title}.png`);
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: session.title });
        return;
      } catch {
        // fall back to download
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
  }

  async function close() {
    setBusy(true);
    // Online: the outbox must be empty first. Offline closing is allowed and syncs later.
    if (navigator.onLine && (await unsyncedCount(session.id)) > 0) {
      const { flush } = await import('@/lib/sync');
      await flush();
      const left = await unsyncedCount(session.id);
      if (left > 0) {
        setBusy(false);
        return show({ message: t('closeOutbox', { count: left }), tone: 'error' });
      }
    }
    const r = await recordOne(session.id, 'SESSION_CLOSED', {});
    setBusy(false);
    if (!r.ok) return show({ message: errorText(r), tone: 'error' });
    haptic();
    track('night_closed', { duration_bucket: durationBucket(Date.now() - new Date(session.startedAt).getTime()) });
    show({ message: t('closed') });
    maybeOfferInstall();
  }

  async function reopen() {
    const r = await recordOne(session.id, 'SESSION_REOPENED', { reason: reason.trim() });
    if (!r.ok) return show({ message: errorText(r), tone: 'error' });
    setReopenOpen(false);
    go(`/app/s/count?id=${session.id}`);
  }

  return (
    <main className="pb-16">
      {reveal && <Reveal results={results} nameOf={nameOf} colorOf={(id) => night.member(id)?.color ?? 'sand'} onDone={() => setReveal(false)} />}

      {!viewer && (
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-hairline bg-bg/95 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 backdrop-blur">
          <Button
            variant="ghost"
            size="sm"
            aria-label={tc('back')}
            className="-ml-2 min-w-12"
            onClick={() => go(closed ? '/app' : `/app/s/count?id=${session.id}`)}
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-semibold">{session.title}</h1>
          {night.isHost && <SyncPill unsynced={night.unsynced} />}
        </header>
      )}

      <div className="px-4 pt-4">
        <Eyebrow>{t('title')}</Eyebrow>
        <p className="mt-1 text-caption text-text-3">
          {t('stats', {
            players: tc('players', { count: people }),
            duration: durationText(session.startedAt, state.closedAt),
            chips: formatINR(chipsIssued),
            shorts: shortsCount,
          })}
        </p>
        {closed && session.verifiedAt && <p className="mt-1 text-caption text-win">✓ {t('verified')}</p>}
        {session.status === 'needs_review' && (
          <p role="alert" className="mt-2 rounded-[var(--radius-btn)] border border-loss/40 p-3 text-label text-loss">
            {t('needsReview', { reason: session.reviewNote ?? '' })}
          </p>
        )}

        {/* Results */}
        <ul className="mt-3 space-y-2">
          {results.map((r, i) => (
            <ResultRow key={r.memberId} r={r} rank={i} night={night} open={open === r.memberId} onToggle={() => setOpen(open === r.memberId ? null : r.memberId)} />
          ))}
        </ul>

        {kitty && (
          <p className="mt-3 text-label text-text-2">
            🍲 {t('kitty', { amount: formatINR(kitty.collected), name: nameOf(kitty.holderMemberId) })}
            {kitty.unpaid.length > 0 && <span className="text-warn"> · {t('kittyUnpaid', { names: kitty.unpaid.map(nameOf).join(', ') })}</span>}
          </p>
        )}
        {bankMismatch.map((b) => (
          <p key={b.id} className="mt-2 text-label text-loss">
            {t('bankMismatch', { amount: formatSigned(b.payload.counted - b.payload.expected) })}
          </p>
        ))}

        {/* Who pays whom */}
        <section className="mt-8">
          <h2 className="mb-3 font-serif text-[28px] leading-none">{t('settleTitle')}</h2>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-[var(--radius-btn)] bg-well p-1" role="tablist">
            {(['fewest', 'bank'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn('min-h-11 rounded-[10px] text-label', view === v ? 'bg-surface-2 shadow-[var(--key)]' : 'text-text-2')}
              >
                {v === 'fewest' ? t('fewest') : t('viaBank')}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="text-text-2">{t('nothing')}</p>
          ) : (
            <>
              <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
                {rows.map((r) => {
                  const paid = isPaid(r);
                  return (
                    <li key={`${r.from}>${r.to}`} className="flex min-h-14 items-center gap-3 px-4">
                      <span className={cn('flex-1', paid && 'text-text-3 line-through')}>{r.label}</span>
                      <span className="tnum font-semibold">{formatINR(r.amount)}</span>
                      {canEdit && !closed ? (
                        <label className="flex min-h-12 items-center gap-2 pl-2 text-caption text-text-2">
                          <input type="checkbox" checked={paid} onChange={(e) => mark(r, e.target.checked)} className="size-5 accent-[var(--flame)]" />
                          {t('paid')}
                        </label>
                      ) : (
                        paid && <span className="text-caption text-win">✓ {t('paid')}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-caption text-text-3">{t('progress', { done, total: rows.length })}</p>
            </>
          )}
        </section>

        {/* Share */}
        <section className="mt-8 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={shareWhatsapp}>
            {t('shareWhatsapp')}
          </Button>
          <Button variant="outline" onClick={shareImage}>
            {t('shareImage')}
          </Button>
          <Button variant="ghost" className="col-span-2" onClick={() => go(viewer ? `/v/${session.viewToken}/log` : `/app/s/log?id=${session.id}`)}>
            <ScrollText size={18} strokeWidth={1.5} aria-hidden /> {tl('log')}
          </Button>
        </section>

        {canEdit && (
          <section className="mt-6">
            {!closed ? (
              <Button variant="primary" size="lg" disabled={busy} onClick={close}>
                {busy ? t('closing') : t('close')}
              </Button>
            ) : (
              <Button variant="ghost" size="lg" onClick={() => setReopenOpen(true)}>
                {t('reopen')}
              </Button>
            )}
          </section>
        )}
      </div>

      <div aria-hidden className="pointer-events-none fixed top-0 -left-[9999px]">
        <ShareCard ref={cardRef} title={session.title} startedAt={session.startedAt} results={results} transfers={st.transfers} nameOf={nameOf} buyIn={session.config.buyIn} />
      </div>

      <Sheet open={reopenOpen} onClose={() => setReopenOpen(false)} title={t('reopen')}>
        <div className="space-y-3">
          <Field label={t('reopenReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
          <Button variant="primary" size="lg" disabled={!reason.trim()} onClick={reopen}>
            {t('reopen')}
          </Button>
        </div>
      </Sheet>
      <ToastHost bottom={24} />
    </main>
  );
}

function ResultRow({ r, rank, night, open, onToggle }: { r: MemberResult; rank: number; night: Night; open: boolean; onToggle: () => void }) {
  const t = useTranslations('settle');
  const tl = useTranslations('live');
  const m = night.member(r.memberId);
  const stints = night.state.stints.filter((s) => s.memberId === r.memberId);
  const repaid = stints.reduce((a, s) => a + s.repaidCash + s.repaidChips, 0);
  const adj = stints.reduce((a, s) => a + s.adj, 0);
  return (
    <li className={cn('rounded-[var(--radius-card)] bg-surface-1 shadow-[var(--key)]', rank === 0 && r.pnl > 0 && 'shadow-[var(--glow-flame)] outline outline-1 outline-flame/40')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-16 w-full items-center gap-3 px-3 text-left">
        <span className="tnum w-5 text-caption text-text-3">{rank + 1}</span>
        <Avatar name={m?.nickname ?? '?'} color={m?.color ?? 'sand'} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">
            {m?.nickname} {r.adjusted && (
              <span className="text-warn">
                <span aria-hidden>⚠</span>
                <span className="sr-only">{t('adjustedMark')}</span>
              </span>
            )}
          </span>
          {r.titles.length > 0 && (
            <span className="block text-caption text-gold">{r.titles.map((x) => `${TITLE_ICON[x]} ${t(`titles.${x}`)}`).join(' · ')}</span>
          )}
        </span>
        <span className={cn('tnum text-amount font-semibold', r.pnl > 0 && 'text-win', r.pnl < 0 && 'text-loss')}>{formatSigned(r.pnl)}</span>
        <ChevronDown size={18} strokeWidth={1.5} className={cn('text-text-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-1 border-t border-hairline px-4 py-3 text-label text-text-2">
          <p>{t('stints', { count: r.stints })}</p>
          {stints.map((s, i) => {
            const d = derive(s);
            return (
              <p key={s.id} className="tnum text-caption text-text-3">
                #{i + 1}: {tl('in', { amount: formatINR(d.netChips) })} → {formatINR((s.final ?? 0) + s.adj)} = {formatSigned(d.pnl ?? 0)}
                {s.left && d.deferred !== 0 ? ` · ${t('deferred', { amount: formatSigned(d.deferred) })}` : ''}
              </p>
            );
          })}
          {r.shortsTaken > 0 && (
            <p>
              {t('shortsTaken', { amount: formatINR(r.shortsTaken) })} · {t('shortsRepaid', { amount: formatINR(repaid) })}
            </p>
          )}
          {adj !== 0 && <p className="text-warn">⚠ {t('adjusted', { amount: formatSigned(adj) })}</p>}
        </div>
      )}
    </li>
  );
}
