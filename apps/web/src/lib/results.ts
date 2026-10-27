'use client';
import { useQuery } from '@tanstack/react-query';
import type { ResultRow } from './stats';
import { supabase } from './supabase';

type Row = { session_id: string; member_id: string; pnl: number; sessions: { started_at: string; title: string; group_id: string } };

/** Verified results (§9.4) for a group, or for a set of claimed members across groups. */
export function useResults(filter: { groupId: string } | { memberIds: string[] }) {
  return useQuery({
    queryKey: ['results', filter],
    enabled: 'groupId' in filter || filter.memberIds.length > 0,
    queryFn: async (): Promise<ResultRow[]> => {
      let q = supabase().from('session_results').select('session_id, member_id, pnl, sessions!inner(started_at, title, group_id)');
      q = 'groupId' in filter ? q.eq('sessions.group_id', filter.groupId) : q.in('member_id', filter.memberIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Row[]).map((r) => ({
        sessionId: r.session_id,
        memberId: r.member_id,
        pnl: r.pnl,
        startedAt: r.sessions.started_at,
        title: r.sessions.title,
        groupId: r.sessions.group_id,
      }));
    },
  });
}
