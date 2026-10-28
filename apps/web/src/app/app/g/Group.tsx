'use client';
import type { ChipSet } from '@hisaab/ledger';
import { Avatar, Button, Eyebrow, Sheet, cn, formatINR, formatSigned } from '@hisaab/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { ArrowLeft, ChevronRight, Copy, Link2, Play, Plus, UserPlus } from '@/components/AnimatedIcon';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Field } from '@/components/Field';
import { Loading } from '@/components/Splash';
import { StatusBadge } from '@/components/StatusBadge';
import { ToastHost } from '@/components/ToastHost';
import { useAuth } from '@/lib/auth';
import { db, type LocalGroup, type LocalMember } from '@/lib/db';
import { addMember, nicknameError, updateGroup, updateMember } from '@/lib/groups';
import { newToken } from '@/lib/ids';
import { useGo, useQueryId } from '@/lib/nav';
import { useResults } from '@/lib/results';
import { inRange, leaderboard } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { pullGroups } from '@/lib/sync';
import { useToast } from '@/lib/toast';
import { GROUP_EMOJIS } from '../groups/Groups';

type Tab = 'members' | 'nights' | 'leaderboard' | 'settings';

export function Group() {
  const id = useQueryId();
  const go = useGo();
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const th = useTranslations('home');
  const userId = useAuth((s) => s.userId);
  const group = useLiveQuery(async () => (id ? ((await db.groups.get(id)) ?? null) : null), [id]);
  const members = useLiveQuery(
    async () => (id ? (await db.members.where('groupId').equals(id).toArray()).filter((m) => !m.archivedAt) : []),
    [id],
  );
  const [tab, setTab] = useState<Tab>('members');
  if (group === undefined || !members) return <Loading />;
  if (!group) return <p className="p-6 text-text-2">{tc('notFound')}</p>;
  const me = members.find((m) => m.userId === userId);
  const isAdmin = me?.role === 'owner' || me?.role === 'admin';
  const tabs: Tab[] = ['members', 'nights', 'leaderboard', 'settings'];

  return (
    <main className="px-4 pt-4">
      <header className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-label={tc('back')} className="-ml-2 min-w-12" onClick={() => go('/app/groups')}>
          <ArrowLeft size={20} strokeWidth={1.5} />
        </Button>
        <span className="text-[24px]" aria-hidden>
          {group.emoji}
        </span>
        <h1 className="min-w-0 flex-1 truncate font-serif text-[24px]">{group.name}</h1>
        <Button variant="primary" size="sm" onClick={() => go(`/app/new?group=${group.id}`)}>
          <Play size={16} strokeWidth={1.5} aria-hidden /> {th('newNight')}
        </Button>
      </header>

      <div role="tablist" aria-label={group.name} className="mb-4 grid grid-cols-4 gap-1 rounded-[var(--radius-btn)] bg-well p-1">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setTab(k)}
            className={cn('min-h-10 rounded-[calc(var(--radius-btn)-4px)] text-label', tab === k ? 'bg-surface-2 text-text shadow-[var(--key)]' : 'text-text-2')}
          >
            {t(k)}
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'members' && <Members group={group} members={members} me={me} isAdmin={isAdmin} />}
        {tab === 'nights' && <Nights groupId={group.id} />}
        {tab === 'leaderboard' && <Leaderboard group={group} members={members} />}
        {tab === 'settings' && <Settings group={group} isAdmin={isAdmin} />}
      </section>
      <ToastHost />
    </main>
  );
}

// ───────── members ─────────

function Members({ group, members, me, isAdmin }: { group: LocalGroup; members: LocalMember[]; me?: LocalMember; isAdmin: boolean }) {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const show = useToast((s) => s.show);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LocalMember | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const sorted = useMemo(
    () => [...members].sort((a, b) => +(b.id === me?.id) - +(a.id === me?.id) || a.nickname.localeCompare(b.nickname, 'en-IN')),
    [members, me],
  );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const err = nicknameError(members, name);
    if (err) return setError(err);
    await addMember(group.id, name);
    setName('');
    setError(null);
    setAdding(false);
  }

  async function createInvite() {
    if (!navigator.onLine) return show({ message: tc('offline'), tone: 'error' });
    const token = newToken();
    const { error: err } = await supabase()
      .from('group_invites')
      .insert({ token, group_id: group.id, created_by: me!.userId, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() });
    if (err) return show({ message: err.message, tone: 'error' });
    setInvite(`${location.origin}/join/${token}`);
  }

  return (
    <>
      <ul className="mb-4 divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
        {sorted.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setSelected(m)}
              className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left disabled:cursor-default"
            >
              <Avatar name={m.nickname} color={m.color} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.nickname}</span>
                <span className="block text-caption text-text-3">
                  {[m.role === 'owner' && t('owner'), m.role === 'admin' && t('admin'), m.userId && t('claimed')].filter(Boolean).join(' · ')}
                </span>
              </span>
              {isAdmin && <ChevronRight size={18} strokeWidth={1.5} className="text-text-3" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>

      <div className="grid gap-2">
        <Button variant="surface" size="lg" onClick={() => setAdding(true)}>
          <UserPlus size={18} strokeWidth={1.5} aria-hidden /> {t('addMember')}
        </Button>
        {isAdmin && (
          <Button variant="outline" size="lg" onClick={createInvite}>
            <Link2 size={18} strokeWidth={1.5} aria-hidden /> {t('createInvite')}
          </Button>
        )}
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('addMember')}>
        <form onSubmit={add} className="grid gap-4">
          <Field label={t('name')} value={name} onChange={(e) => (setName(e.target.value), setError(null))} error={error} maxLength={24} autoFocus />
          <Button type="submit" variant="primary" size="lg" disabled={!name.trim()}>
            {t('addMember')}
          </Button>
        </form>
      </Sheet>

      <Sheet open={!!invite} onClose={() => setInvite(null)} title={t('invite')}>
        <p className="mb-3 text-text-2">{t('inviteBody')}</p>
        <p className="mb-4 break-all rounded-[var(--radius-btn)] bg-well p-3 text-caption">{invite}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="surface"
            onClick={async () => {
              await navigator.clipboard?.writeText(invite!);
              show({ message: tc('copied') }, 2000);
            }}
          >
            <Copy size={18} strokeWidth={1.5} aria-hidden /> {tc('copy')}
          </Button>
          <Button variant="primary" onClick={() => void navigator.share?.({ text: `${group.emoji} ${group.name}: ${invite}` }).catch(() => {})}>
            {tc('share')}
          </Button>
        </div>
      </Sheet>

      {selected && <MemberSheet member={selected} members={members} me={me} group={group} onClose={() => setSelected(null)} />}
    </>
  );
}

function MemberSheet({
  member,
  members,
  me,
  group,
  onClose,
}: {
  member: LocalMember;
  members: LocalMember[];
  me?: LocalMember;
  group: LocalGroup;
  onClose: () => void;
}) {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const show = useToast((s) => s.show);
  const [name, setName] = useState(member.nickname);
  const error = name.trim() === member.nickname ? null : nicknameError(members, name, member.id);
  const isOwner = me?.role === 'owner';
  const isSelf = member.id === me?.id;
  // There is no unarchive, so removing takes a second tap.
  const [archiving, setArchiving] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      onClose();
    } catch (e) {
      show({ message: e instanceof Error ? e.message : String(e), tone: 'error' });
    }
  }

  return (
    <Sheet open onClose={onClose} title={member.nickname}>
      <div className="grid gap-3">
        <Field label={t('rename')} value={name} onChange={(e) => setName(e.target.value)} error={error} maxLength={24} />
        <Button variant="surface" disabled={!!error || name.trim() === member.nickname} onClick={() => run(() => updateMember(member.id, { nickname: name.trim() }))}>
          {tc('save')}
        </Button>
        {member.userId && member.role === 'member' && (
          <Button variant="outline" onClick={() => run(() => updateMember(member.id, { role: 'admin' }))}>
            {t('makeAdmin')}
          </Button>
        )}
        {member.role === 'admin' && !isSelf && (
          <Button variant="outline" onClick={() => run(() => updateMember(member.id, { role: 'member' }))}>
            {t('removeAdmin')}
          </Button>
        )}
        {isOwner && member.userId && !isSelf && (
          <Button
            variant="outline"
            onClick={() =>
              run(async () => {
                if (!navigator.onLine) throw new Error(tc('offline'));
                const { error: err } = await supabase().rpc('transfer_ownership', { group_id: group.id, member_id: member.id });
                if (err) throw err;
                await pullGroups();
              })
            }
          >
            {t('makeOwner')}
          </Button>
        )}
        {member.userId && member.role !== 'owner' && !isSelf && (
          <Button variant="danger" onClick={() => run(() => updateMember(member.id, { userId: null, role: 'member' }))}>
            {t('unlink')}
          </Button>
        )}
        {member.role !== 'owner' && !isSelf && (
          <Button
            variant="danger"
            onClick={() => (archiving ? run(() => updateMember(member.id, { archivedAt: new Date().toISOString() })) : setArchiving(true))}
          >
            <Trash2 size={18} strokeWidth={1.5} aria-hidden /> {archiving ? t('archiveConfirm', { name: member.nickname }) : t('archive')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

// ───────── nights ─────────

function Nights({ groupId }: { groupId: string }) {
  const th = useTranslations('home');
  const sessions = useLiveQuery(() => db.sessions.where('groupId').equals(groupId).reverse().sortBy('startedAt'), [groupId]);
  if (!sessions) return null;
  if (!sessions.length) return <p className="text-text-3">{th('noNights')}</p>;
  return (
    <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
      {sessions.map((s) => {
        const live = s.status === 'live' || s.status === 'counting';
        return (
          <li key={s.id}>
            <Link href={live ? `/app/s?id=${s.id}` : `/app/s/settle?id=${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.title}</span>
                <span className="block text-caption text-text-3">
                  {new Date(s.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {formatINR(s.config.buyIn)}
                </span>
              </span>
              <StatusBadge status={s.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ───────── leaderboard ─────────

type Range = 'all' | 'year' | 'festive' | 'custom';

function Leaderboard({ group, members }: { group: LocalGroup; members: LocalMember[] }) {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const results = useResults({ groupId: group.id });
  const [range, setRange] = useState<Range>(group.festiveSeason ? 'festive' : 'all');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const ranges: Range[] = group.festiveSeason ? ['all', 'year', 'festive', 'custom'] : ['all', 'year', 'custom'];
  const year = String(new Date().getFullYear());
  const bounds =
    range === 'year'
      ? { start: `${year}-01-01`, end: `${year}-12-31` }
      : range === 'festive'
        ? (group.festiveSeason ?? {})
        : range === 'custom'
          ? { start: custom.start || undefined, end: custom.end || undefined }
          : {};
  const nameOf = (id: string) => members.find((m) => m.id === id)?.nickname ?? '?';

  return (
    <>
      <div role="radiogroup" aria-label={t('leaderboard')} className="mb-3 flex flex-wrap gap-2">
        {ranges.map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={range === r}
            onClick={() => setRange(r)}
            className={cn('min-h-10 rounded-full px-4 text-label', range === r ? 'bg-flame text-on-flame' : 'bg-surface-2 text-text-2')}
          >
            {t(`ranges.${r}`)}
          </button>
        ))}
      </div>
      {range === 'custom' && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field label={t('from')} type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
          <Field label={t('to')} type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
        </div>
      )}
      {results.isPending ? (
        <p className="text-text-3">{tc('loading')}</p>
      ) : results.isError ? (
        <p className="text-text-3">{navigator.onLine ? results.error.message : tc('offline')}</p>
      ) : (
        <LeaderTable rows={leaderboard(inRange(results.data, bounds))} nameOf={nameOf} />
      )}
    </>
  );
}

function LeaderTable({ rows, nameOf }: { rows: ReturnType<typeof leaderboard>; nameOf: (id: string) => string }) {
  const t = useTranslations('group');
  if (!rows.length) return <p className="text-text-3">{t('noStats')}</p>;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-hairline">
      <table className="tnum w-full text-label">
        <thead className="text-caption text-text-3">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-normal">
              <span className="sr-only">#</span>
            </th>
            <th scope="col" className="py-2 text-right font-normal">{t('cols.net')}</th>
            <th scope="col" className="py-2 text-right font-normal">{t('cols.nights')}</th>
            <th scope="col" className="py-2 text-right font-normal">{t('cols.won')}</th>
            <th scope="col" className="py-2 text-right font-normal">{t('cols.best')}</th>
            <th scope="col" className="px-3 py-2 text-right font-normal">{t('cols.streak')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((r, i) => (
            <tr key={r.memberId}>
              <th scope="row" className="max-w-28 truncate px-3 py-3 text-left font-normal">
                <span className="mr-1 text-text-3">{i + 1}</span> {nameOf(r.memberId)}
              </th>
              <td className={cn('py-3 text-right', r.net > 0 && 'text-win', r.net < 0 && 'text-loss')}>{formatSigned(r.net)}</td>
              <td className="py-3 text-right">{r.nights}</td>
              <td className="py-3 text-right">{r.won}</td>
              <td className="py-3 text-right">{r.best > 0 ? formatINR(r.best) : '—'}</td>
              <td className="px-3 py-3 text-right">{r.streak || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────── settings ─────────

const CHIP_COLORS = [
  { label: 'White', color: '#F2ECE0' },
  { label: 'Red', color: '#C8102E' },
  { label: 'Green', color: '#2E7D32' },
  { label: 'Blue', color: '#1E5BB8' },
  { label: 'Black', color: '#1A1A1A' },
  { label: 'Yellow', color: '#E0B000' },
];

function Settings({ group, isAdmin }: { group: LocalGroup; isAdmin: boolean }) {
  const t = useTranslations('group');
  const tc = useTranslations('common');
  const show = useToast((s) => s.show);
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [buyIn, setBuyIn] = useState(group.defaultBuyIn);
  const [festive, setFestive] = useState(group.festiveSeason ?? { start: '', end: '' });
  const [chips, setChips] = useState<ChipSet>(group.chipSet ?? []);
  const validFestive = !festive.start === !festive.end && (!festive.start || festive.start <= festive.end);
  const valid = !!name.trim() && buyIn > 0 && validFestive && chips.every((c) => c.value > 0);

  async function save() {
    await updateGroup(group.id, {
      name: name.trim(),
      emoji,
      defaultBuyIn: buyIn,
      festiveSeason: festive.start ? festive : null,
      chipSet: chips.length ? chips : null,
    });
    show({ message: tc('done') }, 2000);
  }

  return (
    <fieldset disabled={!isAdmin} className="grid gap-4">
      {!isAdmin && <p className="text-caption text-text-3">{t('onlyAdmins')}</p>}
      <Field label={t('name')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <div>
        <span className="mb-1.5 block text-label text-text-2">{t('emoji')}</span>
        <div className="flex flex-wrap gap-2">
          {GROUP_EMOJIS.map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={emoji === x}
              aria-label={x}
              onClick={() => setEmoji(x)}
              className={cn('size-12 rounded-[var(--radius-btn)] text-[22px]', emoji === x ? 'bg-surface-2 ring-2 ring-flame' : 'bg-well')}
            >
              {x}
            </button>
          ))}
        </div>
      </div>
      <Field
        label={t('defaultBuyIn')}
        type="number"
        inputMode="numeric"
        min={1}
        value={buyIn || ''}
        onChange={(e) => setBuyIn(Math.max(0, Math.floor(Number(e.target.value))))}
      />

      <div>
        <Eyebrow className="mb-1">{t('festive')}</Eyebrow>
        <p className="mb-2 text-caption text-text-3">{t('festiveHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('from')} type="date" value={festive.start} onChange={(e) => setFestive({ ...festive, start: e.target.value })} />
          <Field label={t('to')} type="date" value={festive.end} onChange={(e) => setFestive({ ...festive, end: e.target.value })} />
        </div>
      </div>

      <div>
        <Eyebrow className="mb-1">{t('chipSet')}</Eyebrow>
        <p className="mb-2 text-caption text-text-3">{t('chipSetHint')}</p>
        <ul className="mb-2 grid gap-2">
          {chips.map((c, i) => (
            <li key={i} className="flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1.5 block text-label text-text-2">{t('chipLabel')}</span>
                <select
                  value={c.label}
                  onChange={(e) => {
                    const p = CHIP_COLORS.find((x) => x.label === e.target.value)!;
                    setChips(chips.map((x, j) => (j === i ? { ...x, ...p } : x)));
                  }}
                  className="h-12 w-full rounded-[var(--radius-btn)] bg-well px-3 shadow-[var(--key-pressed)]"
                >
                  {CHIP_COLORS.map((p) => (
                    <option key={p.label}>{p.label}</option>
                  ))}
                </select>
              </label>
              <Field
                className="w-28"
                label={t('chipValue')}
                type="number"
                inputMode="numeric"
                min={1}
                value={c.value || ''}
                onChange={(e) => setChips(chips.map((x, j) => (j === i ? { ...x, value: Math.max(0, Math.floor(Number(e.target.value))) } : x)))}
              />
              <Button variant="ghost" aria-label={t('removeChip', { label: c.label })} onClick={() => setChips(chips.filter((_, j) => j !== i))}>
                <Trash2 size={18} strokeWidth={1.5} />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const p = CHIP_COLORS.find((x) => !chips.some((c) => c.label === x.label)) ?? CHIP_COLORS[0]!;
            setChips([...chips, { ...p, value: 0 }]);
          }}
        >
          <Plus size={16} strokeWidth={1.5} aria-hidden /> {t('addChip')}
        </Button>
      </div>

      {isAdmin && (
        <Button variant="primary" size="lg" disabled={!valid} onClick={save}>
          {tc('save')}
        </Button>
      )}
    </fieldset>
  );
}
