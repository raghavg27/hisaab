'use client';
import {
  applyEvent,
  canApply,
  project,
  type CanApply,
  type EventType,
  type LedgerEvent,
  type NightState,
  type PayloadOf,
} from '@hisaab/ledger';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useAuth } from './auth';
import { db, type LocalEvent, type LocalMember, type LocalSession } from './db';
import { newId } from './ids';
import { requestFlush } from './sync-bus';

/** `id` may be preset when another event must reference it (Fix links void → correction). */
export type Draft = { [T in EventType]: { type: T; payload: PayloadOf<T>; id?: string } }[EventType];

export type RecordResult = { ok: true; events: LedgerEvent[] } | Extract<CanApply, { ok: false }>;

export async function loadEvents(sessionId: string): Promise<LocalEvent[]> {
  return db.events.where('[sessionId+seq]').between([sessionId, 0], [sessionId, Infinity]).toArray();
}

/**
 * The only write path for a night (§9.3): validate with the ledger, then append to
 * IndexedDB with the next seq in one transaction. Sync happens later.
 */
export async function record(sessionId: string, drafts: Draft[]): Promise<RecordResult> {
  const actor = useAuth.getState().userId;
  if (!actor) return { ok: false, code: 'not_started', message: 'Sign in first' };
  const result = await db.transaction('rw', db.events, db.sessions, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return { ok: false as const, code: 'not_started' as const, message: 'Night not found' };
    if (session.hostUserId !== actor)
      return { ok: false as const, code: 'not_started' as const, message: 'You are not the host of this night' };
    const existing = await loadEvents(sessionId);
    let state: NightState = project(existing);
    const all: LedgerEvent[] = [...existing];
    const added: LocalEvent[] = [];
    for (const d of drafts) {
      const e = {
        id: d.id ?? newId(),
        sessionId,
        seq: state.lastSeq + 1,
        hostEpoch: session.hostEpoch,
        type: d.type,
        payload: d.payload,
        actorUserId: actor,
        clientTs: new Date().toISOString(),
        synced: 0,
      } as LocalEvent;
      const r = canApply(state, e);
      if (!r.ok) return r;
      all.push(e);
      added.push(e);
      if (e.type === 'EVENT_VOIDED') state = project(all);
      else {
        state.log.push({ event: e, voided: null });
        applyEvent(state, e);
      }
    }
    await db.events.bulkAdd(added);
    const status = state.status === 'empty' ? session.status : state.status;
    if (status !== session.status || state.bankHolderMemberId !== session.bankHolderMemberId)
      await db.sessions.update(sessionId, {
        status,
        bankHolderMemberId: state.bankHolderMemberId ?? session.bankHolderMemberId,
        closedAt: state.closedAt,
      });
    return { ok: true as const, events: added as LedgerEvent[] };
  });
  if (result.ok) requestFlush();
  return result;
}

export function recordOne<T extends EventType>(sessionId: string, type: T, payload: PayloadOf<T>) {
  return record(sessionId, [{ type, payload } as Draft]);
}

export interface Night {
  session: LocalSession;
  members: LocalMember[];
  events: LocalEvent[];
  state: NightState;
  nameOf: (memberId: string) => string;
  member: (memberId: string) => LocalMember | undefined;
  isHost: boolean;
  unsynced: number;
}

/** Live view of one night from IndexedDB, re-projected whenever events change (< 50 ms). */
export function useNight(sessionId: string | null): Night | null | undefined {
  const userId = useAuth((s) => s.userId);
  const data = useLiveQuery(async () => {
    if (!sessionId) return null;
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const [members, events] = await Promise.all([
      db.members.where('groupId').equals(session.groupId).toArray(),
      loadEvents(sessionId),
    ]);
    return { session, members, events };
  }, [sessionId]);

  return useMemo(() => {
    if (data === undefined) return undefined;
    if (data === null) return null;
    const byId = new Map(data.members.map((m) => [m.id, m]));
    const state = project(data.events);
    return {
      ...data,
      state,
      nameOf: (id: string) => byId.get(id)?.nickname ?? '?',
      member: (id: string) => byId.get(id),
      isHost: data.session.hostUserId === userId,
      unsynced: data.events.filter((e) => !e.synced).length,
    };
  }, [data, userId]);
}
