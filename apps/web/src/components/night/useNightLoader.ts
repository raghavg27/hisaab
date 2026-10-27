'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { heartbeat, pullEvents, pullSession, subscribeSession } from '@/lib/sync';
import { useNight } from '@/lib/night';
import { db } from '@/lib/db';
import { rowToMember } from '@/lib/sync';
import { supabase } from '@/lib/supabase';

/**
 * Opens a night from IndexedDB; if it isn't on this device yet, fetches it (another device,
 * a group member, or a new host). Follows Realtime while open, and heartbeats while hosting.
 */
export function useNightLoader(id: string | null) {
  const night = useNight(id);
  const userId = useAuth((s) => s.userId);
  const [fetching, setFetching] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id || night !== null || fetching) return;
    if (!navigator.onLine) return setMissing(true);
    setFetching(true);
    void (async () => {
      const ok = await pullSession(id);
      if (ok) {
        const s = await db.sessions.get(id);
        if (s) {
          const { data } = await supabase().from('group_members').select('*').eq('group_id', s.groupId);
          if (data) await db.members.bulkPut(data.map(rowToMember));
        }
        await pullEvents(id);
      } else setMissing(true);
      setFetching(false);
    })();
  }, [id, night, fetching]);

  const isHost = !!night && night.session.hostUserId === userId;
  const live = !!night && night.session.status !== 'closed';

  useEffect(() => {
    if (!id || !night || !navigator.onLine) return;
    return subscribeSession(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, !!night]);

  useEffect(() => {
    if (!id || !isHost || !live) return;
    void heartbeat(id);
    const h = setInterval(() => void heartbeat(id), 60_000);
    return () => clearInterval(h);
  }, [id, isHost, live]);

  return { night, missing: missing && night === null };
}
