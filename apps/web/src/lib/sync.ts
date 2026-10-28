'use client';
import type { LedgerEvent } from '@hisaab/ledger';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { EntityTable, IDType, InsertType } from 'dexie';
import { create } from 'zustand';
import { useAuth } from './auth';
import { db, type LocalEvent, type LocalGroup, type LocalMember, type LocalSession } from './db';
import { onFlushRequest } from './sync-bus';
import { supabase } from './supabase';

// ───────── row mapping ─────────

type Row = Record<string, unknown>;

export const groupToRow = (g: LocalGroup) => ({
  id: g.id,
  name: g.name,
  emoji: g.emoji,
  owner_id: g.ownerId,
  default_buy_in: g.defaultBuyIn,
  chip_set: g.chipSet,
  festive_season: g.festiveSeason,
  created_at: g.createdAt,
  updated_at: g.updatedAt,
  deleted_at: g.deletedAt,
});
export const rowToGroup = (r: Row): LocalGroup => ({
  id: r.id as string,
  name: r.name as string,
  emoji: (r.emoji as string) ?? '🪔',
  ownerId: (r.owner_id as string) ?? null,
  defaultBuyIn: r.default_buy_in as number,
  chipSet: (r.chip_set as LocalGroup['chipSet']) ?? null,
  festiveSeason: (r.festive_season as LocalGroup['festiveSeason']) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
  deletedAt: (r.deleted_at as string) ?? null,
  dirty: 0,
});
export const memberToRow = (m: LocalMember) => ({
  id: m.id,
  group_id: m.groupId,
  nickname: m.nickname,
  color: m.color,
  user_id: m.userId,
  role: m.role,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
  archived_at: m.archivedAt,
});
export const rowToMember = (r: Row): LocalMember => ({
  id: r.id as string,
  groupId: r.group_id as string,
  nickname: r.nickname as string,
  color: r.color as string,
  userId: (r.user_id as string) ?? null,
  role: r.role as LocalMember['role'],
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
  archivedAt: (r.archived_at as string) ?? null,
  dirty: 0,
});
const sessionToRow = (s: LocalSession) => ({
  id: s.id,
  group_id: s.groupId,
  title: s.title,
  host_user_id: s.hostUserId,
  host_epoch: 1,
  bank_holder_member_id: s.bankHolderMemberId,
  config: s.config,
  view_token: s.viewToken,
  started_at: s.startedAt,
});
export const rowToSession = (r: Row): LocalSession => ({
  id: r.id as string,
  groupId: r.group_id as string,
  title: r.title as string,
  status: r.status as LocalSession['status'],
  hostUserId: r.host_user_id as string,
  hostEpoch: r.host_epoch as number,
  hostLastSeenAt: (r.host_last_seen_at as string) ?? null,
  bankHolderMemberId: r.bank_holder_member_id as string,
  config: r.config as LocalSession['config'],
  viewToken: r.view_token as string,
  startedAt: r.started_at as string,
  closedAt: (r.closed_at as string) ?? null,
  verifiedAt: (r.verified_at as string) ?? null,
  reviewNote: (r.review_note as string) ?? null,
  dirty: 0,
});
const eventToRow = (e: LedgerEvent) => ({
  id: e.id,
  session_id: e.sessionId,
  seq: e.seq,
  host_epoch: e.hostEpoch,
  type: e.type,
  payload: e.payload,
  actor_user_id: e.actorUserId,
  client_ts: e.clientTs,
});
export const rowToEvent = (r: Row): LocalEvent =>
  ({
    id: r.id,
    sessionId: r.session_id,
    seq: r.seq,
    hostEpoch: r.host_epoch,
    type: r.type,
    payload: r.payload,
    actorUserId: r.actor_user_id,
    clientTs: r.client_ts,
    synced: 1,
  }) as LocalEvent;

// ───────── status ─────────

interface SyncStatus {
  online: boolean;
  syncing: boolean;
  error: string | null;
  /** Session ids where this device lost hosting and had entries rejected. */
  lostHost: string[];
}

export const useSync = create<SyncStatus>(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  error: null,
  lostHost: [],
}));

const canSync = () => {
  const { userId, isAnonymous } = useAuth.getState();
  return navigator.onLine && !!userId && !isAnonymous;
};

// ───────── push ─────────

let running = false;
let again = false;

/** Pushes the outbox: groups → members → sessions → events (by seq). Idempotent. */
export async function flush(): Promise<void> {
  if (!canSync()) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  useSync.setState({ syncing: true });
  const sb = supabase();
  try {
    const groups = await db.groups.where('dirty').equals(1).toArray();
    if (groups.length) {
      const { error } = await sb.from('groups').upsert(groups.map(groupToRow));
      if (error) throw error;
      await markClean(db.groups, groups);
    }
    // Claimed rows first: the creator's owner row is what lets RLS accept the rest.
    const members = (await db.members.where('dirty').equals(1).toArray()).sort((a, b) => +!a.userId - +!b.userId);
    for (const m of members) {
      const { error } = await sb.from('group_members').upsert(memberToRow(m));
      if (error?.code === '23505' && error.message.includes('nickname')) {
        // Someone else added the same nickname from another device.
        await db.members.update(m.id, { nickname: `${m.nickname} 2` });
        again = true;
        continue;
      }
      if (error) throw error;
      await markClean(db.members, [m]);
    }
    const sessions = await db.sessions.where('dirty').equals(1).toArray();
    if (sessions.length) {
      const { error } = await sb
        .from('sessions')
        .upsert(sessions.map(sessionToRow), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      await db.sessions.bulkUpdate(sessions.map((s) => ({ key: s.id, changes: { dirty: 0 as const } })));
    }
    const pending = await db.events.where('synced').equals(0).toArray();
    const bySession = Map.groupBy(pending, (e) => e.sessionId);
    for (const [sessionId, events] of bySession) await pushEvents(sessionId, events);
    useSync.setState({ error: null });
  } catch (err) {
    useSync.setState({ error: err instanceof Error ? err.message : String((err as { message?: string }).message) });
  } finally {
    running = false;
    useSync.setState({ syncing: false });
    if (again) {
      again = false;
      void flush();
    }
  }
}

async function markClean<T extends { id: string; updatedAt: string }>(
  table: { get: (id: string) => Promise<T | undefined>; update: (id: string, c: object) => Promise<number> },
  rows: T[],
) {
  for (const r of rows) {
    const cur = await table.get(r.id);
    if (cur && cur.updatedAt === r.updatedAt) await table.update(r.id, { dirty: 0 });
  }
}

async function pushEvents(sessionId: string, events: LocalEvent[]) {
  events.sort((a, b) => a.seq - b.seq);
  // A closed night accepts only SESSION_REOPENED, and the server reopens it after that insert
  // finishes, so entries after a reopen go up in the next request.
  const reopen = events.findIndex((e) => e.type === 'SESSION_REOPENED');
  if (reopen >= 0 && reopen < events.length - 1) {
    await pushEvents(sessionId, events.slice(0, reopen + 1));
    return pushEvents(sessionId, events.slice(reopen + 1));
  }
  const rows = events.map(({ synced: _s, ...e }) => eventToRow(e as LedgerEvent));
  const { error } = await supabase()
    .from('events')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    // RLS (stale epoch / not host) or seq taken by the new host.
    if (error.code === '42501' || error.code === '23505') return handleRejected(sessionId, events);
    throw error;
  }
  await db.events.bulkUpdate(events.map((e) => ({ key: e.id, changes: { synced: 1 as const } })));
  if (events.some((e) => e.type === 'SESSION_CLOSED')) await verifyAndClose(sessionId);
}

/** §8.8: this device lost hosting. Keep the refused entries so the new host can re-enter them. */
async function handleRejected(sessionId: string, events: LocalEvent[]) {
  const { data } = await supabase().from('sessions').select('*').eq('id', sessionId).maybeSingle();
  const me = useAuth.getState().userId;
  if (!data || (data.host_user_id === me && data.host_epoch === events[0]?.hostEpoch)) {
    throw new Error('Sync was refused by the server');
  }
  const at = new Date().toISOString();
  await db.transaction('rw', db.events, db.rejected, db.sessions, async () => {
    await db.rejected.bulkPut(
      events.map(({ synced: _s, ...e }) => ({ id: e.id, sessionId, event: e as LedgerEvent, rejectedAt: at })),
    );
    await db.events.bulkDelete(events.map((e) => e.id));
    await db.sessions.put(rowToSession(data));
  });
  useSync.setState((s) => ({ lostHost: [...new Set([...s.lostHost, sessionId])] }));
  await pullEvents(sessionId);
}

export async function verifyAndClose(sessionId: string) {
  const { data, error } = await supabase().functions.invoke('verify-and-close', { body: { sessionId } });
  if (error) return;
  if (data?.ok) await db.sessions.update(sessionId, { verifiedAt: data.verifiedAt, status: 'closed', reviewNote: null });
  else if (data) await db.sessions.update(sessionId, { status: 'needs_review', reviewNote: data.error ?? null });
}

// ───────── pull ─────────

/** Groups, members and sessions for every group I'm in. Local unsynced edits win. */
export async function pullGroups() {
  if (!canSync()) return;
  const sb = supabase();
  const me = useAuth.getState().userId!;
  const { data: mine, error } = await sb.from('group_members').select('group_id').eq('user_id', me);
  if (error || !mine) return;
  const ids = mine.map((m) => m.group_id as string);
  if (!ids.length) return;
  const [groups, members, sessions] = await Promise.all([
    sb.from('groups').select('*').in('id', ids),
    sb.from('group_members').select('*').in('group_id', ids),
    sb.from('sessions').select('*').in('group_id', ids).order('started_at', { ascending: false }).limit(200),
  ]);
  await db.transaction('rw', [db.groups, db.members, db.sessions, db.events], async () => {
    for (const r of groups.data ?? []) await putUnlessDirty(db.groups, rowToGroup(r));
    for (const r of members.data ?? []) await putUnlessDirty(db.members, rowToMember(r));
    for (const r of sessions.data ?? []) await mergeSession(rowToSession(r));
  });
}

async function putUnlessDirty<T extends { id: string; dirty: 0 | 1 }>(table: EntityTable<T, 'id'>, row: T) {
  const cur = await table.get(row.id as IDType<T, 'id'>);
  if (!cur || !cur.dirty) await table.put(row as InsertType<T, 'id'>);
}

/** Server session row wins, except status while this device still has unsynced events for it. */
export async function mergeSession(remote: LocalSession) {
  const local = await db.sessions.get(remote.id);
  const unsynced = await db.events.where({ sessionId: remote.id, synced: 0 }).count();
  if (local && (local.dirty || unsynced)) {
    await db.sessions.put({
      ...remote,
      status: local.status,
      closedAt: local.closedAt,
      bankHolderMemberId: local.bankHolderMemberId,
      dirty: local.dirty,
    });
  } else await db.sessions.put(remote);
}

export async function pullSession(sessionId: string): Promise<boolean> {
  const { data } = await supabase().from('sessions').select('*').eq('id', sessionId).maybeSingle();
  if (!data) return false;
  await mergeSession(rowToSession(data));
  return true;
}

/** Fetches every event after the last contiguous seq we hold. */
export async function pullEvents(sessionId: string) {
  const local = await db.events.where('[sessionId+seq]').between([sessionId, 0], [sessionId, Infinity]).keys();
  let last = 0;
  for (const [, seq] of local as unknown as [string, number][]) {
    if (seq !== last + 1) break;
    last = seq;
  }
  const { data, error } = await supabase()
    .from('events')
    .select('*')
    .eq('session_id', sessionId)
    .gt('seq', last)
    .order('seq');
  if (error || !data) return;
  if (data.length) await db.events.bulkPut(data.map(rowToEvent));
}

/** Read path (§9.3): realtime inserts, refetching on seq gaps and reconnects. */
export function subscribeSession(sessionId: string): () => void {
  const sb = supabase();
  let lastSeq = 0;
  void db.events
    .where('sessionId')
    .equals(sessionId)
    .toArray()
    .then((es) => (lastSeq = Math.max(0, ...es.map((e) => e.seq))));
  const channel: RealtimeChannel = sb
    .channel(`night:${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'events', filter: `session_id=eq.${sessionId}` },
      async ({ new: row }) => {
        const e = rowToEvent(row);
        await db.events.put(e);
        if (e.seq !== lastSeq + 1) await pullEvents(sessionId);
        lastSeq = Math.max(lastSeq, e.seq);
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
      ({ new: row }) => void mergeSession(rowToSession(row)),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void pullSession(sessionId);
        void pullEvents(sessionId);
      }
    });
  return () => void sb.removeChannel(channel);
}

// ───────── worker ─────────

let started = false;

export function startSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), 250);
  };
  const setOnline = () => {
    useSync.setState({ online: navigator.onLine });
    if (navigator.onLine) {
      void flush();
      void pullGroups();
    }
  };
  window.addEventListener('online', setOnline);
  window.addEventListener('offline', setOnline);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
  onFlushRequest(soon);
  setInterval(() => void flush(), 10_000);
  useAuth.subscribe((s, prev) => {
    if (s.userId && s.userId !== prev.userId) {
      void flush();
      void pullGroups();
    }
  });
}

export async function heartbeat(sessionId: string) {
  if (!canSync()) return;
  await supabase().rpc('heartbeat', { session_id: sessionId });
}
