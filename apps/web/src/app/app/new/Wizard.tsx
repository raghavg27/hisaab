'use client';
import { MAX_PLAYERS } from '@hisaab/ledger';
import { Avatar, Button, Eyebrow, Keypad, Sheet, cn, formatINR } from '@hisaab/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { GripVertical } from 'lucide-react';
import { ArrowLeft, Check, Plus } from '@/components/AnimatedIcon';
import { Reorder, useDragControls } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/Field';
import { Toggle } from '@/components/Toggle';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { BUY_IN_PRESETS } from '@/lib/config';
import { db } from '@/lib/db';
import { addMember, createGroup, dateTitle, lastGroupId, lastPlayers, nicknameError, startNight } from '@/lib/groups';
import { useGo } from '@/lib/nav';
import { useToast } from '@/lib/toast';

export function Wizard() {
  const t = useTranslations('wizard');
  const tc = useTranslations('common');
  const go = useGo();
  const userId = useAuth((s) => s.userId);
  const show = useToast((s) => s.show);
  const preset = useSearchParams().get('group');

  const groups = useLiveQuery(() => db.groups.filter((g) => !g.deletedAt).toArray(), []);
  const [groupId, setGroupId] = useState<string | null>(preset);
  const members = useLiveQuery(
    async () => (groupId ? (await db.members.where('groupId').equals(groupId).toArray()).filter((m) => !m.archivedAt) : []),
    [groupId],
  );
  const group = groups?.find((g) => g.id === groupId);

  const [seats, setSeats] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [buyIn, setBuyIn] = useState(500);
  const [topUp, setTopUp] = useState<number | null>(null);
  const [bankHolder, setBankHolder] = useState<string | null>(null);
  const [useChips, setUseChips] = useState(false);
  const [kittyOn, setKittyOn] = useState(false);
  const [kittyAmount, setKittyAmount] = useState(100);
  const [kittyHolder, setKittyHolder] = useState<string | null>(null);
  const [title, setTitle] = useState(dateTitle());
  const [keypad, setKeypad] = useState<null | 'buyIn' | 'topUp' | 'kitty'>(null);
  const [keyValue, setKeyValue] = useState(0);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Last-used group preselected.
  useEffect(() => {
    if (groupId || !groups?.length) return;
    void lastGroupId().then((id) => setGroupId(groups.find((g) => g.id === id)?.id ?? groups[0]!.id));
  }, [groups, groupId]);

  // Group defaults + last night's players, once per group.
  const initFor = useRef<string | null>(null);
  useEffect(() => {
    if (!group || !members?.length || initFor.current === group.id) return;
    initFor.current = group.id;
    setBuyIn(group.defaultBuyIn);
    setUseChips(false);
    void lastPlayers(group.id).then((ids) => {
      const valid = ids.filter((id) => members.some((m) => m.id === id));
      const mine = members.find((m) => m.userId === userId);
      setSeats(valid.length ? valid : mine ? [mine.id] : []);
    });
  }, [group, members, userId]);

  const mine = members?.find((m) => m.userId === userId);
  const holder = bankHolder && seats.includes(bankHolder) ? bankHolder : mine && seats.includes(mine.id) ? mine.id : seats[0];
  const kHolder = kittyHolder && seats.includes(kittyHolder) ? kittyHolder : holder;
  const name = (id: string) => members?.find((m) => m.id === id);

  function toggle(id: string) {
    setSeats((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!groupId || !members) return;
    const err = nicknameError(members, newName);
    if (err) return setNameErr(err);
    const m = await addMember(groupId, newName);
    setSeats((s) => [...s, m.id]);
    setNewName('');
    setNameErr(null);
  }

  async function makeGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const g = await createGroup({ name: newGroupName });
    setGroupId(g.id);
    setNewGroupOpen(false);
    setNewGroupName('');
  }

  function openKeypad(k: 'buyIn' | 'topUp' | 'kitty') {
    setKeyValue(k === 'buyIn' ? buyIn : k === 'topUp' ? (topUp ?? buyIn) : kittyAmount);
    setKeypad(k);
  }

  function saveKeypad() {
    if (keyValue > 0) {
      if (keypad === 'buyIn') setBuyIn(keyValue);
      if (keypad === 'topUp') setTopUp(keyValue);
      if (keypad === 'kitty') setKittyAmount(keyValue);
    }
    setKeypad(null);
  }

  async function start() {
    if (!groupId || !holder || seats.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const id = await startNight({
        groupId,
        title: title.trim() || dateTitle(),
        memberIds: seats,
        buyIn,
        topUp: topUp ?? buyIn,
        bankHolderMemberId: holder,
        chipSet: useChips ? (group?.chipSet ?? null) : null,
        kitty: kittyOn && kHolder ? { amount: kittyAmount, holderMemberId: kHolder } : null,
      });
      track('night_started', { players: seats.length });
      show({ message: t('bankShouldHold', { amount: formatINR(seats.length * buyIn), count: seats.length, buyIn: formatINR(buyIn) }) }, 5000);
      go(`/app/s?id=${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!groups) return null;

  return (
    <main className="px-4 pt-4 pb-32">
      <header className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label={tc('back')} onClick={() => history.back()} className="-ml-2 min-w-12">
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Button>
        <h1 className="text-title font-semibold">{t('title')}</h1>
      </header>

      {/* 1. Group */}
      <section className="mb-6" aria-labelledby="w-group">
        <Eyebrow id="w-group" className="mb-2">
          1 · {t('stepGroup')}
        </Eyebrow>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroupId(g.id)}
              aria-pressed={g.id === groupId}
              className={cn(
                'min-h-12 shrink-0 rounded-full border px-4 text-label',
                g.id === groupId ? 'border-flame bg-flame/10 text-text' : 'border-hairline-strong text-text-2',
              )}
            >
              {g.emoji} {g.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNewGroupOpen(true)}
            className="flex min-h-12 shrink-0 items-center gap-1 rounded-full border border-dashed border-hairline-strong px-4 text-label text-text-2"
          >
            <Plus size={16} strokeWidth={1.5} aria-hidden /> {t('newGroup')}
          </button>
        </div>
      </section>

      {groupId && members && (
        <>
          {/* 2. Players */}
          <section className="mb-6" aria-labelledby="w-players">
            <div className="mb-2 flex items-baseline justify-between">
              <Eyebrow id="w-players">2 · {t('stepPlayers')}</Eyebrow>
              <span className="text-caption text-text-3">{t('selected', { count: seats.length })}</span>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {members.map((m) => {
                const on = seats.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    className={cn(
                      'flex min-h-12 items-center gap-2 rounded-full border py-1 pr-4 pl-1',
                      on ? 'border-flame/60 bg-surface-2' : 'border-hairline text-text-3',
                    )}
                  >
                    <Avatar name={m.nickname} color={m.color} size={32} className={on ? '' : 'opacity-50'} />
                    {m.nickname}
                    {on && <Check size={16} strokeWidth={1.5} className="text-flame" aria-hidden />}
                  </button>
                );
              })}
            </div>
            <form onSubmit={addPerson} className="flex gap-2">
              <Field
                label={<span className="sr-only">{t('addPerson')}</span>}
                placeholder={t('addPersonPlaceholder')}
                value={newName}
                onChange={(e) => (setNewName(e.target.value), setNameErr(null))}
                error={nameErr}
                className="flex-1"
                enterKeyHint="done"
              />
              <Button type="submit" variant="outline" aria-label={t('addPerson')} className="mt-[22px] min-w-12" disabled={!newName.trim()}>
                <Plus size={20} strokeWidth={1.5} />
              </Button>
            </form>
            {seats.length > 1 && (
              <div className="mt-4">
                <p className="mb-2 text-caption text-text-3">{t('dragHint')}</p>
                <Reorder.Group axis="y" values={seats} onReorder={setSeats} className="space-y-1">
                  {seats.map((id, i) => {
                    const m = name(id);
                    if (!m) return null;
                    return <Seat key={id} id={id} index={i} nickname={m.nickname} color={m.color} />;
                  })}
                </Reorder.Group>
              </div>
            )}
          </section>

          {/* 3. Amounts */}
          <section className="mb-6 space-y-5" aria-labelledby="w-amounts">
            <Eyebrow id="w-amounts">3 · {t('stepAmounts')}</Eyebrow>
            <div>
              <p className="mb-2 text-label text-text-2">{t('buyIn')}</p>
              <div className="grid grid-cols-5 gap-2">
                {BUY_IN_PRESETS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setBuyIn(v)}
                    aria-pressed={buyIn === v}
                    className={cn(
                      'tnum min-h-12 rounded-[var(--radius-btn)] border text-label',
                      buyIn === v ? 'border-flame bg-flame/10' : 'border-hairline-strong text-text-2',
                    )}
                  >
                    {formatINR(v)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => openKeypad('buyIn')}
                  aria-pressed={!BUY_IN_PRESETS.includes(buyIn)}
                  className={cn(
                    'tnum min-h-12 rounded-[var(--radius-btn)] border text-label',
                    !BUY_IN_PRESETS.includes(buyIn) ? 'border-flame bg-flame/10' : 'border-hairline-strong text-text-2',
                  )}
                >
                  {BUY_IN_PRESETS.includes(buyIn) ? tc('custom') : formatINR(buyIn)}
                </button>
              </div>
            </div>

            <Toggle checked={topUp === null} onChange={(on) => setTopUp(on ? null : buyIn)} label={`${t('topUp')} · ${t('sameAsBuyIn')}`} />
            {topUp !== null && (
              <Button variant="outline" onClick={() => openKeypad('topUp')} className="tnum w-full justify-between">
                {t('topUp')} <span>{formatINR(topUp)}</span>
              </Button>
            )}

            {seats.length > 0 && (
              <label className="block">
                <span className="mb-1.5 block text-label text-text-2">
                  {t('bankHolder')} <span className="text-text-3">· {t('bankHolderHint')}</span>
                </span>
                <select
                  value={holder}
                  onChange={(e) => setBankHolder(e.target.value)}
                  className="h-12 w-full rounded-[var(--radius-btn)] bg-well px-4 text-body shadow-[var(--key-pressed)]"
                >
                  {seats.map((id) => (
                    <option key={id} value={id}>
                      {name(id)?.nickname}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {group?.chipSet?.length ? (
              <Toggle checked={useChips} onChange={setUseChips} label={t('chipCounter')} hint={t('chipCounterHint')} />
            ) : null}

            <Toggle checked={kittyOn} onChange={setKittyOn} label={t('kitty')} hint={t('kittyHint')} />
            {kittyOn && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => openKeypad('kitty')} className="tnum justify-between">
                  {t('kittyAmount')} <span>{formatINR(kittyAmount)}</span>
                </Button>
                <select
                  aria-label={t('kittyHolder')}
                  value={kHolder}
                  onChange={(e) => setKittyHolder(e.target.value)}
                  className="h-12 rounded-[var(--radius-btn)] bg-well px-3 shadow-[var(--key-pressed)]"
                >
                  {seats.map((id) => (
                    <option key={id} value={id}>
                      {name(id)?.nickname}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <Field label={t('nightTitle')} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
          </section>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-hairline bg-bg/95 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur">
        {error && (
          <p role="alert" className="mb-2 text-caption text-loss">
            {error}
          </p>
        )}
        <Button variant="primary" size="lg" disabled={busy || seats.length < 2 || seats.length > MAX_PLAYERS || !holder} onClick={start}>
          {busy
            ? t('starting')
            : seats.length < 2
              ? t('needTwo')
              : seats.length > MAX_PLAYERS
                ? t('tooMany', { max: MAX_PLAYERS })
                : `${t('start')} · ${formatINR(seats.length * buyIn)}`}
        </Button>
      </div>

      <Sheet open={keypad !== null} onClose={() => setKeypad(null)} title={keypad === 'kitty' ? t('kittyAmount') : keypad === 'topUp' ? t('topUp') : t('buyIn')}>
        <Keypad value={keyValue} onChange={setKeyValue} />
        <Button variant="primary" size="lg" className="mt-3" disabled={!keyValue} onClick={saveKeypad}>
          {tc('done')}
        </Button>
      </Sheet>

      <Sheet open={newGroupOpen} onClose={() => setNewGroupOpen(false)} title={t('newGroup')}>
        <form onSubmit={makeGroup} className="space-y-3">
          <Field label={t('groupName')} placeholder={t('groupNamePlaceholder')} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} maxLength={60} autoFocus />
          <Button type="submit" variant="primary" size="lg" disabled={!newGroupName.trim()}>
            {t('create')}
          </Button>
        </form>
      </Sheet>
    </main>
  );
}

/** One seat row. Only the grip starts a drag, so swiping over the list still scrolls the page. */
function Seat({ id, index, nickname, color }: { id: string; index: number; nickname: string; color: string }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="flex min-h-12 items-center gap-3 rounded-[var(--radius-btn)] bg-surface-1 pl-3 shadow-[var(--key)]"
    >
      <span className="tnum w-5 text-caption text-text-3">{index + 1}</span>
      <Avatar name={nickname} color={color} size={28} />
      <span className="flex-1">{nickname}</span>
      <span
        aria-hidden
        onPointerDown={(e) => controls.start(e)}
        className="flex size-12 cursor-grab touch-none items-center justify-center text-text-3 active:cursor-grabbing"
      >
        <GripVertical size={18} strokeWidth={1.5} />
      </span>
    </Reorder.Item>
  );
}
