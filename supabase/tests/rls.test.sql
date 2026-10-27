-- RLS and integrity checks (§14.2). Runs in one transaction and rolls back:
--   supabase test db --linked
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

-- ───── fixtures (as the owner role) ─────
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'host@rls.test'),
  ('00000000-0000-4000-8000-00000000000b', 'viewer@rls.test'),
  ('00000000-0000-4000-8000-00000000000c', 'stranger@rls.test'),
  ('00000000-0000-4000-8000-00000000000d', 'late@rls.test');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-00000000000a', 'Host'),
  ('00000000-0000-4000-8000-00000000000b', 'Viewer'),
  ('00000000-0000-4000-8000-00000000000c', 'Stranger'),
  ('00000000-0000-4000-8000-00000000000d', 'Late');
insert into public.groups (id, name, owner_id) values
  ('00000000-0000-4000-8000-0000000000a1', 'RLS group', '00000000-0000-4000-8000-00000000000a');
insert into public.group_members (id, group_id, nickname, color, user_id, role) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Host', 'marigold', '00000000-0000-4000-8000-00000000000a', 'owner'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'Rohit', 'rani', null, 'member');
insert into public.sessions (id, group_id, title, host_user_id, host_epoch, bank_holder_member_id, config, view_token, started_at) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'RLS night',
   '00000000-0000-4000-8000-00000000000a', 1, '00000000-0000-4000-8000-0000000000b1', '{"buyIn":500,"topUp":500}', 'rls-view-token', now());
insert into public.events (id, session_id, seq, host_epoch, type, payload, actor_user_id, client_ts) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1', 1, 1, 'SESSION_STARTED',
   '{"title":"RLS night","buyIn":500,"topUp":500,"bankHolderMemberId":"00000000-0000-4000-8000-0000000000b1"}',
   '00000000-0000-4000-8000-00000000000a', now());

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- Rows touched, so a policy that silently filters everything still reads as "0 changed".
create function pg_temp.changed(q text) returns int language plpgsql as $$
declare n int;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;
select throws_ok($$ update public.events set payload = '{}' where id = '00000000-0000-4000-8000-0000000000d1' $$,
  'P0001', 'events are append-only', 'the append-only trigger stops even the table owner');
set local role authenticated;

-- ───── viewer ─────
select pg_temp.act_as('00000000-0000-4000-8000-00000000000b');
select lives_ok($$ select public.redeem_view_token('rls-view-token') $$, 'a viewer can redeem a live link');
select is((select count(*) from public.events where session_id = '00000000-0000-4000-8000-0000000000c1')::int, 1,
  'a viewer reads the log');
select throws_ok($$
  insert into public.events (id, session_id, seq, host_epoch, type, payload, actor_user_id, client_ts) values
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000c1', 2, 1, 'TOP_UP', '{}', '00000000-0000-4000-8000-00000000000b', now())
$$, '42501', null, 'a viewer can''t insert events');

-- ───── non-member ─────
select pg_temp.act_as('00000000-0000-4000-8000-00000000000c');
select is((select count(*) from public.sessions where id = '00000000-0000-4000-8000-0000000000c1')::int, 0,
  'a non-member can''t see the night');
select is((select count(*) from public.events where session_id = '00000000-0000-4000-8000-0000000000c1')::int, 0,
  'a non-member can''t see its events');
select is((select count(*) from public.group_members where group_id = '00000000-0000-4000-8000-0000000000a1')::int, 0,
  'a non-member can''t see the group''s members');
select throws_ok($$
  insert into public.group_members (id, group_id, nickname, color, role) values
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', 'Sneaky', 'sand', 'member')
$$, '42501', null, 'a non-member can''t add members');

-- ───── host: append-only log, epochs ─────
select pg_temp.act_as('00000000-0000-4000-8000-00000000000a');
select lives_ok($$
  insert into public.events (id, session_id, seq, host_epoch, type, payload, actor_user_id, client_ts) values
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000c1', 2, 1, 'PLAYER_JOINED',
   '{"stintId":"00000000-0000-4000-8000-0000000000e1","memberId":"00000000-0000-4000-8000-0000000000b1"}',
   '00000000-0000-4000-8000-00000000000a', now())
$$, 'the host appends events');
select is(pg_temp.changed($$ update public.events set payload = '{}' where id = '00000000-0000-4000-8000-0000000000d1' $$), 0,
  'events can''t be updated');
select is(pg_temp.changed($$ delete from public.events where id = '00000000-0000-4000-8000-0000000000d1' $$), 0,
  'events can''t be deleted');
select throws_ok($$
  insert into public.events (id, session_id, seq, host_epoch, type, payload, actor_user_id, client_ts) values
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000c1', 3, 0, 'TOP_UP', '{}', '00000000-0000-4000-8000-00000000000a', now())
$$, '42501', null, 'a stale host_epoch is rejected');

-- ───── revoked link ─────
select lives_ok($$ select public.rotate_view_token('00000000-0000-4000-8000-0000000000c1', true) $$, 'the host can revoke the link');
select pg_temp.act_as('00000000-0000-4000-8000-00000000000d');
select throws_ok($$ select public.redeem_view_token('rls-view-token') $$, 'P0002', null,
  'a revoked token can''t be redeemed');

select * from finish();
rollback;
