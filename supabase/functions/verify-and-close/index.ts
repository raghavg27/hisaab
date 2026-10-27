// verify-and-close (PRD §9.4): replay the night with the same ledger code the client uses,
// assert gap = 0 and Σ P&L = 0, then write session_results and mark the night verified.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { derive, firstInvalid, nightResults, project, reconcile, voidedMap } from '../_shared/ledger.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { sessionId } = await req.json().catch(() => ({}));
  if (typeof sessionId !== 'string') return json({ ok: false, error: 'sessionId required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });

  // The caller must be able to see the night (RLS).
  const { data: visible } = await asUser.from('sessions').select('id').eq('id', sessionId).maybeSingle();
  if (!visible) return json({ ok: false, error: 'not found' }, 404);

  const { data: session } = await service.from('sessions').select('*').eq('id', sessionId).single();
  const { data: rows, error } = await service.from('events').select('*').eq('session_id', sessionId).order('seq');
  if (error || !session || !rows) return json({ ok: false, error: error?.message ?? 'not found' }, 500);
  const { data: members } = await service.from('group_members').select('id, nickname').eq('group_id', session.group_id);
  const names = new Map((members ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]));
  const nameOf = (id: string) => names.get(id) ?? id;

  const events = rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    sessionId: r.session_id,
    seq: r.seq,
    hostEpoch: r.host_epoch,
    type: r.type,
    payload: r.payload,
    actorUserId: r.actor_user_id,
    clientTs: r.client_ts,
  }));

  const fail = async (reason: string) => {
    await service.from('sessions').update({ status: 'needs_review', review_note: reason, verified_at: null }).eq('id', sessionId);
    return json({ ok: false, error: reason });
  };

  const state = project(events);
  if (state.status !== 'closed') return json({ ok: false, error: 'night is not closed' });
  const voided = voidedMap(events);
  const bad = firstInvalid(events.filter((e: { id: string; type: string }) => !voided.has(e.id) && e.type !== 'EVENT_VOIDED'));
  if (bad) return fail(`entry #${bad.event.seq} is invalid: ${bad.message}`);
  const { gap } = reconcile(state.stints);
  if (gap !== 0) return fail(`count is off by ${gap}`);
  const total = state.stints.reduce((a: number, s: Parameters<typeof derive>[0]) => a + (derive(s).pnl ?? 0), 0);
  if (total !== 0) return fail(`results sum to ${total}, not 0`);

  const results = nightResults(state, nameOf);
  await service.from('session_results').delete().eq('session_id', sessionId);
  const { error: insErr } = await service.from('session_results').insert(
    results.map((r: ReturnType<typeof nightResults>[number]) => ({
      session_id: sessionId,
      member_id: r.memberId,
      pnl: r.pnl,
      cash_in: r.cashIn,
      shorts_taken: r.shortsTaken,
      shorts_count: r.shortsCount,
      stints: r.stints,
      adjusted: r.adjusted,
      titles: r.titles,
    })),
  );
  if (insErr) return json({ ok: false, error: insErr.message }, 500);
  const verifiedAt = new Date().toISOString();
  await service.from('sessions').update({ verified_at: verifiedAt, status: 'closed', review_note: null }).eq('id', sessionId);
  return json({ ok: true, verifiedAt });
});
