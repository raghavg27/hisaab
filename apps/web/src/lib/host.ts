'use client';
import { db } from './db';
import { supabase } from './supabase';
import { flush, pullEvents, pullSession } from './sync';

export async function unsyncedCount(sessionId?: string) {
  const all = await db.events.where('synced').equals(0).toArray();
  const dirty = await db.sessions.where('dirty').equals(1).count();
  return all.filter((e) => !sessionId || e.sessionId === sessionId).length + dirty;
}

/** Handover precondition (§8.8): online and the outbox is empty. */
export async function drainOutbox(sessionId: string, timeoutMs = 15_000): Promise<'ok' | 'offline' | 'timeout'> {
  if (!navigator.onLine) return 'offline';
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    await flush();
    if ((await unsyncedCount(sessionId)) === 0) return 'ok';
    await new Promise((r) => setTimeout(r, 700));
  }
  return 'timeout';
}

async function refresh(sessionId: string) {
  await pullSession(sessionId);
  await pullEvents(sessionId);
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function transferHost(sessionId: string, toUserId: string) {
  await rpc('transfer_host', { session_id: sessionId, to_user_id: toUserId });
  await refresh(sessionId);
}

export async function offerHost(sessionId: string): Promise<string> {
  return rpc<string>('offer_host', { session_id: sessionId });
}

export async function acceptHost(sessionId: string, code: string) {
  await rpc('accept_host', { session_id: sessionId, code });
  await refresh(sessionId);
}

export async function forceTakeover(sessionId: string) {
  await rpc('force_takeover', { session_id: sessionId });
  await refresh(sessionId);
}

export async function rotateViewToken(sessionId: string, revoke = false): Promise<string> {
  const token = await rpc<string>('rotate_view_token', { session_id: sessionId, revoke });
  await db.sessions.update(sessionId, { viewToken: token });
  return token;
}
