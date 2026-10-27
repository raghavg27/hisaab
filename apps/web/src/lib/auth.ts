'use client';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { db, type LocalProfile } from './db';
import { supabase } from './supabase';

interface AuthState {
  ready: boolean;
  session: Session | null;
  userId: string | null;
  isAnonymous: boolean;
  profile: LocalProfile | null;
}

export const useAuth = create<AuthState>(() => ({
  ready: false,
  session: null,
  userId: null,
  isAnonymous: false,
  profile: null,
}));

async function loadProfile(userId: string | null): Promise<LocalProfile | null> {
  if (!userId) return null;
  const local = (await db.profiles.get(userId)) ?? null;
  if (local || !navigator.onLine) return local;
  const { data } = await supabase().from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!data) return null;
  const p: LocalProfile = {
    id: data.id,
    displayName: data.display_name,
    avatarColor: data.avatar_color,
    locale: data.locale,
    ageConfirmedAt: data.age_confirmed_at,
  };
  await db.profiles.put(p);
  return p;
}

async function apply(session: Session | null) {
  const userId = session?.user.id ?? null;
  const profile = await loadProfile(userId);
  useAuth.setState({
    ready: true,
    session,
    userId,
    isAnonymous: session?.user.is_anonymous ?? false,
    profile,
  });
}

let started = false;

/** Reads the persisted session (works offline) and follows auth changes. */
export function startAuth() {
  if (started) return;
  started = true;
  const sb = supabase();
  sb.auth.getSession().then(({ data }) => apply(data.session));
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    void apply(session);
  });
}

export async function refreshProfile() {
  const { userId } = useAuth.getState();
  if (userId) await db.profiles.delete(userId);
  useAuth.setState({ profile: await loadProfile(userId) });
}

export async function saveProfile(p: LocalProfile) {
  const { error } = await supabase().from('profiles').upsert({
    id: p.id,
    display_name: p.displayName,
    avatar_color: p.avatarColor,
    locale: p.locale,
    age_confirmed_at: p.ageConfirmedAt,
  });
  if (error) throw error;
  await db.profiles.put(p);
  useAuth.setState({ profile: p });
}

export async function signOut() {
  await supabase().auth.signOut();
  await db.delete();
  await db.open();
  useAuth.setState({ session: null, userId: null, profile: null, isAnonymous: false });
}
