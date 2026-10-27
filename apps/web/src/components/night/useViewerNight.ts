'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useNightLoader } from './useNightLoader';

/**
 * Viewer access (§8.7): anonymous sign-in under the hood if needed, then `redeem_view_token`
 * adds this user to session_viewers so RLS lets them read the night and follow it live.
 */
export function useViewerNight(token: string) {
  const { ready, userId } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<'expired' | string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      void supabase()
        .auth.signInAnonymously()
        .then(({ error: e }) => e && setError(e.message));
      return;
    }
    let cancelled = false;
    void supabase()
      .rpc('redeem_view_token', { token })
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) return setError(e.code === 'P0002' ? 'expired' : e.message);
        const row = (data as { session_id: string }[] | null)?.[0];
        if (row) setSessionId(row.session_id);
        else setError('expired');
      });
    return () => {
      cancelled = true;
    };
  }, [ready, userId, token, attempt]);

  const { night, missing } = useNightLoader(sessionId);
  return {
    night,
    // The session row exists only once the host has synced it.
    notSynced: missing,
    error,
    retry: () => (setError(null), setAttempt((n) => n + 1)),
  };
}
