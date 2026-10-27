'use client';
import { nextColor } from '@hisaab/ui';
import { useAuth } from './auth';
import { db, getMeta, setMeta, type LocalGroup, type LocalMember, type SessionConfig } from './db';
import { newId, newToken } from './ids';
import { record, type Draft } from './night';
import { requestFlush } from './sync-bus';

const now = () => new Date().toISOString();
const collator = new Intl.Collator('en-IN', { sensitivity: 'base' });

/** Nicknames are unique within a group; on a clash suggest adding an initial ("Rohit K"). */
export function nicknameError(members: LocalMember[], nickname: string, exceptId?: string): string | null {
  const name = nickname.trim();
  if (!name) return 'Enter a name';
  if (name.length > 24) return 'Keep it under 24 letters';
  const clash = members.find((m) => m.id !== exceptId && collator.compare(m.nickname, name) === 0);
  return clash ? `"${clash.nickname}" is already in this group. Add an initial, like "${name} K".` : null;
}

export async function createGroup(input: { name: string; emoji?: string; defaultBuyIn?: number }): Promise<LocalGroup> {
  const { userId, profile } = useAuth.getState();
  if (!userId || !profile) throw new Error('Sign in first');
  const t = now();
  const group: LocalGroup = {
    id: newId(),
    name: input.name.trim(),
    emoji: input.emoji ?? '🪔',
    ownerId: userId,
    defaultBuyIn: input.defaultBuyIn ?? 500,
    chipSet: null,
    festiveSeason: null,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    dirty: 1,
  };
  const me: LocalMember = {
    id: newId(),
    groupId: group.id,
    nickname: profile.displayName,
    color: profile.avatarColor,
    userId,
    role: 'owner',
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
    dirty: 1,
  };
  await db.transaction('rw', db.groups, db.members, async () => {
    await db.groups.add(group);
    await db.members.add(me);
  });
  requestFlush();
  return group;
}

export async function updateGroup(id: string, patch: Partial<Omit<LocalGroup, 'id' | 'dirty'>>) {
  await db.groups.update(id, { ...patch, updatedAt: now(), dirty: 1 });
  requestFlush();
}

export async function addMember(groupId: string, nickname: string): Promise<LocalMember> {
  const members = await db.members.where('groupId').equals(groupId).toArray();
  const err = nicknameError(members, nickname);
  if (err) throw new Error(err);
  const t = now();
  const m: LocalMember = {
    id: newId(),
    groupId,
    nickname: nickname.trim(),
    color: nextColor(members.map((x) => x.color)),
    userId: null,
    role: 'member',
    createdAt: t,
    updatedAt: t,
    archivedAt: null,
    dirty: 1,
  };
  await db.members.add(m);
  requestFlush();
  return m;
}

export async function updateMember(id: string, patch: Partial<Omit<LocalMember, 'id' | 'dirty'>>) {
  await db.members.update(id, { ...patch, updatedAt: now(), dirty: 1 });
  requestFlush();
}

export function myMember(members: LocalMember[]): LocalMember | undefined {
  const { userId } = useAuth.getState();
  return members.find((m) => m.userId === userId);
}

/** "Game night · 28 Oct" */
export function dateTitle(d = new Date()) {
  return `Game night · ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

export interface NewNightInput {
  groupId: string;
  title: string;
  memberIds: string[]; // seat order
  buyIn: number;
  topUp: number;
  bankHolderMemberId: string;
  chipSet: SessionConfig['chipSet'];
  kitty: SessionConfig['kitty'];
}

/** Wizard "Start" (§8.3): SESSION_STARTED, then PLAYER_JOINED + BUY_IN for everyone. Works offline. */
export async function startNight(input: NewNightInput): Promise<string> {
  const { userId } = useAuth.getState();
  if (!userId) throw new Error('Sign in first');
  const id = newId();
  await db.sessions.add({
    id,
    groupId: input.groupId,
    title: input.title,
    status: 'live',
    hostUserId: userId,
    hostEpoch: 1,
    hostLastSeenAt: null,
    bankHolderMemberId: input.bankHolderMemberId,
    config: { buyIn: input.buyIn, topUp: input.topUp, chipSet: input.chipSet, kitty: input.kitty },
    viewToken: newToken(),
    startedAt: now(),
    closedAt: null,
    verifiedAt: null,
    reviewNote: null,
    dirty: 1,
  });
  const drafts: Draft[] = [
    {
      type: 'SESSION_STARTED',
      payload: {
        title: input.title,
        buyIn: input.buyIn,
        topUp: input.topUp,
        bankHolderMemberId: input.bankHolderMemberId,
        chipSet: input.chipSet,
        kitty: input.kitty,
      },
    },
  ];
  for (const memberId of input.memberIds) {
    const stintId = newId();
    drafts.push({ type: 'PLAYER_JOINED', payload: { stintId, memberId } });
    drafts.push({ type: 'BUY_IN', payload: { stintId, amount: input.buyIn } });
  }
  const r = await record(id, drafts);
  if (!r.ok) {
    await db.sessions.delete(id);
    throw new Error(r.message);
  }
  await setMeta('lastGroupId', input.groupId);
  await setMeta(`lastPlayers:${input.groupId}`, input.memberIds);
  void navigator.storage?.persist?.();
  return id;
}

export async function lastGroupId() {
  return getMeta<string>('lastGroupId');
}

export async function lastPlayers(groupId: string) {
  return (await getMeta<string[]>(`lastPlayers:${groupId}`)) ?? [];
}
