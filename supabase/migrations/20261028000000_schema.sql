-- Hisaab v1 schema (PRD §9.5). Events are append-only; all game state is derived from them.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 40),
  avatar_color text not null default 'marigold',
  locale text not null default 'en' check (locale in ('en', 'hi-Latn')),
  age_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key,
  name text not null check (length(trim(name)) between 1 and 60),
  emoji text default '🪔',
  owner_id uuid references public.profiles(id) on delete set null,
  default_buy_in int not null default 500 check (default_buy_in > 0),
  chip_set jsonb,
  festive_season jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.group_members (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  nickname text not null check (length(trim(nickname)) between 1 and 24),
  color text not null,
  user_id uuid references public.profiles(id) on delete set null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (group_id, nickname),
  unique (group_id, user_id)
);
create index on public.group_members (user_id);

create table public.group_invites (
  token text primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  max_uses int default 50,
  uses int not null default 0
);

create table public.sessions (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  status text not null default 'live' check (status in ('live', 'counting', 'settling', 'closed', 'needs_review')),
  host_user_id uuid references public.profiles(id) on delete set null,
  host_epoch int not null default 1,
  host_last_seen_at timestamptz,
  bank_holder_member_id uuid references public.group_members(id),
  config jsonb not null,
  view_token text unique not null,
  view_token_revoked_at timestamptz,
  handover_code text,
  handover_expires_at timestamptz,
  review_note text,
  started_at timestamptz not null,
  closed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.sessions (group_id, started_at desc);

create table public.events (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  seq int not null check (seq > 0),
  host_epoch int not null,
  type text not null,
  payload jsonb not null,
  -- Not a FK: deleting an account must not rewrite history.
  actor_user_id uuid not null,
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  unique (session_id, seq)
);

create table public.session_viewers (
  session_id uuid references public.sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.session_results (
  session_id uuid references public.sessions(id) on delete cascade,
  member_id uuid references public.group_members(id) on delete cascade,
  pnl int not null,
  cash_in int not null,
  shorts_taken int not null,
  shorts_count int not null,
  stints int not null,
  adjusted boolean not null default false,
  titles text[] not null default '{}',
  primary key (session_id, member_id)
);
create index on public.session_results (member_id);

-- ───────────────────────── helpers ─────────────────────────

create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.archived_at is null
  );
$$;

create or replace function public.is_group_admin(gid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.archived_at is null and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_session_viewer(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_viewers v
    join public.sessions s on s.id = v.session_id
    where v.session_id = sid and v.user_id = auth.uid()
      and s.view_token_revoked_at is null
      and (s.closed_at is null or s.closed_at > now() - interval '48 hours')
  );
$$;

create or replace function public.can_view_session(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_session_viewer(sid)
    or exists (select 1 from public.sessions s where s.id = sid and public.is_group_member(s.group_id));
$$;

create or replace function public.shares_group(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

create or replace function public.new_token() returns text
language sql volatile set search_path = '' as $$
  -- 22 base62 chars from 22 random bytes ≈ 131 bits
  with b as (select extensions.gen_random_bytes(22) as bytes)
  select string_agg(substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
                           (get_byte(b.bytes, i) % 62) + 1, 1), '')
  from b, generate_series(0, 21) as i;
$$;

-- ───────────────────────── triggers ─────────────────────────

create or replace function public.events_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'events are append-only';
end;
$$;
create trigger events_no_update before update or delete on public.events
  for each row execute function public.events_immutable();

-- Last-write-wins on updated_at for group metadata (§9.3).
create or replace function public.lww_guard() returns trigger
language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;
create trigger groups_lww before update on public.groups for each row execute function public.lww_guard();
create trigger members_lww before update on public.group_members for each row execute function public.lww_guard();

-- Keep the session row's status/bank holder in step with the log.
create or replace function public.on_event_inserted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.sessions s set
    status = case new.type
      when 'COUNTING_STARTED' then 'counting'
      when 'COUNTING_REOPENED' then 'live'
      when 'SESSION_CLOSED' then 'closed'
      when 'SESSION_REOPENED' then 'counting'
      else s.status end,
    closed_at = case new.type
      when 'SESSION_CLOSED' then coalesce((new.client_ts), now())
      when 'SESSION_REOPENED' then null
      else s.closed_at end,
    verified_at = case when new.type = 'SESSION_REOPENED' then null else s.verified_at end,
    bank_holder_member_id = case when new.type = 'BANK_TRANSFERRED'
      then (new.payload->>'toMemberId')::uuid else s.bank_holder_member_id end,
    host_last_seen_at = case when new.actor_user_id = s.host_user_id then now() else s.host_last_seen_at end
  where s.id = new.session_id;
  if new.type = 'SESSION_REOPENED' then
    delete from public.session_results where session_id = new.session_id;
  end if;
  return new;
end;
$$;
create trigger events_after_insert after insert on public.events
  for each row execute function public.on_event_inserted();

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.session_viewers enable row level security;
alter table public.session_results enable row level security;

create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.shares_group(id));
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy groups_select on public.groups for select
  using (public.is_group_member(id) or owner_id = auth.uid());
create policy groups_insert on public.groups for insert with check (owner_id = auth.uid());
create policy groups_update on public.groups for update
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));

create policy members_select on public.group_members for select
  using (
    public.is_group_member(group_id)
    or exists (
      select 1 from public.sessions s
      where s.group_id = group_members.group_id and public.is_session_viewer(s.id)
    )
  );
create policy members_insert on public.group_members for insert with check (
  -- admins add anyone; any member may add an unclaimed nickname (wizard "Add person")
  (public.is_group_admin(group_id))
  or (public.is_group_member(group_id) and user_id is null and role = 'member')
  -- the group creator adds themselves as owner
  or (user_id = auth.uid() and role = 'owner'
      and exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()))
);
create policy members_update on public.group_members for update
  using (public.is_group_admin(group_id)) with check (public.is_group_admin(group_id));

create policy invites_select on public.group_invites for select using (public.is_group_member(group_id));
create policy invites_insert on public.group_invites for insert
  with check (public.is_group_admin(group_id) and created_by = auth.uid());

create policy sessions_select on public.sessions for select using (public.can_view_session(id));
create policy sessions_insert on public.sessions for insert with check (
  public.is_group_member(group_id) and host_user_id = auth.uid() and host_epoch = 1
);

create policy events_select on public.events for select using (public.can_view_session(session_id));
create policy events_insert on public.events for insert with check (
  actor_user_id = auth.uid()
  and exists (
    select 1 from public.sessions s
    where s.id = session_id
      and s.host_user_id = auth.uid()
      and s.host_epoch = events.host_epoch
      and (s.status not in ('closed', 'needs_review') or events.type = 'SESSION_REOPENED')
  )
);

create policy viewers_select on public.session_viewers for select using (user_id = auth.uid());

create policy results_select on public.session_results for select using (
  exists (select 1 from public.sessions s where s.id = session_id and public.is_group_member(s.group_id))
);

-- ───────────────────────── RPCs ─────────────────────────

create or replace function public.redeem_view_token(token text)
returns table (session_id uuid, group_id uuid, title text)
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into s from public.sessions where view_token = token;
  if not found or s.view_token_revoked_at is not null
     or (s.closed_at is not null and s.closed_at < now() - interval '48 hours') then
    raise exception 'link expired' using errcode = 'P0002';
  end if;
  insert into public.session_viewers (session_id, user_id) values (s.id, auth.uid())
    on conflict do nothing;
  return query select s.id, s.group_id, s.title;
end;
$$;

create or replace function public.next_seq(sid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(max(seq), 0) + 1 from public.events where session_id = sid;
$$;

create or replace function public.insert_host_event(s public.sessions, to_user uuid, forced boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.sessions set host_user_id = to_user, host_epoch = s.host_epoch + 1,
    host_last_seen_at = now(), handover_code = null, handover_expires_at = null
  where id = s.id;
  insert into public.events (id, session_id, seq, host_epoch, type, payload, actor_user_id, client_ts)
  values (gen_random_uuid(), s.id, public.next_seq(s.id), s.host_epoch + 1, 'HOST_TRANSFERRED',
    jsonb_build_object('fromUserId', s.host_user_id, 'toUserId', to_user, 'forced', forced),
    auth.uid(), now());
end;
$$;
revoke execute on function public.insert_host_event from public, anon, authenticated;

create or replace function public.transfer_host(session_id uuid, to_user_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = session_id for update;
  if not found or s.host_user_id is distinct from auth.uid() then raise exception 'only the host can hand over'; end if;
  if s.status in ('closed', 'needs_review') then raise exception 'night is closed'; end if;
  if not exists (select 1 from public.group_members m where m.group_id = s.group_id and m.user_id = to_user_id) then
    raise exception 'new host must be a logged-in member of this group';
  end if;
  perform public.insert_host_event(s, to_user_id, false);
  return s.host_epoch + 1;
end;
$$;

-- QR handover: the host offers a short code, the new host (a logged-in group member) accepts it.
create or replace function public.offer_host(session_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.sessions; code text := public.new_token();
begin
  select * into s from public.sessions where id = session_id for update;
  if not found or s.host_user_id is distinct from auth.uid() then raise exception 'only the host can hand over'; end if;
  update public.sessions set handover_code = code, handover_expires_at = now() + interval '10 minutes'
    where id = s.id;
  return code;
end;
$$;

create or replace function public.accept_host(session_id uuid, code text)
returns int language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = session_id for update;
  if not found or s.handover_code is null or s.handover_code <> code or s.handover_expires_at < now() then
    raise exception 'handover code expired';
  end if;
  if not public.is_group_member(s.group_id) then raise exception 'join the group first'; end if;
  perform public.insert_host_event(s, auth.uid(), false);
  return s.host_epoch + 1;
end;
$$;

create or replace function public.force_takeover(session_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = session_id for update;
  if not found or not public.is_group_admin(s.group_id) then raise exception 'only a group admin can take over'; end if;
  if s.status in ('closed', 'needs_review') then raise exception 'night is closed'; end if;
  if s.host_user_id = auth.uid() then raise exception 'you are already the host'; end if;
  if s.host_last_seen_at is not null and s.host_last_seen_at > now() - interval '10 minutes' then
    raise exception 'host was active % minutes ago', floor(extract(epoch from now() - s.host_last_seen_at) / 60)
      using errcode = 'P0001';
  end if;
  perform public.insert_host_event(s, auth.uid(), true);
  return s.host_epoch + 1;
end;
$$;

create or replace function public.heartbeat(session_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.sessions set host_last_seen_at = now()
  where id = session_id and host_user_id = auth.uid();
$$;

create or replace function public.rotate_view_token(session_id uuid, revoke boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare s public.sessions; t text := public.new_token();
begin
  select * into s from public.sessions where id = session_id for update;
  if not found or (s.host_user_id is distinct from auth.uid() and not public.is_group_admin(s.group_id)) then
    raise exception 'not allowed';
  end if;
  update public.sessions set view_token = t,
    view_token_revoked_at = case when revoke then now() else null end
  where id = s.id;
  delete from public.session_viewers v where v.session_id = s.id;
  return t;
end;
$$;

-- Join a group by invite, either as a new member or by claiming an unclaimed one ("I'm Rohit").
create or replace function public.join_group(invite_token text, member_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.group_invites; me public.profiles; nick text; n int := 1; mid uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then raise exception 'finish your profile first'; end if;
  select * into inv from public.group_invites where token = invite_token for update;
  if not found or inv.expires_at < now() or (inv.max_uses is not null and inv.uses >= inv.max_uses) then
    raise exception 'invite expired' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = inv.group_id and user_id = auth.uid()) then
    return inv.group_id;
  end if;
  if member_id is not null then
    update public.group_members set user_id = auth.uid(), updated_at = now()
      where id = member_id and group_id = inv.group_id and user_id is null
      returning id into mid;
    if mid is null then raise exception 'that profile is already claimed'; end if;
  else
    nick := me.display_name;
    while exists (select 1 from public.group_members where group_id = inv.group_id and nickname = nick) loop
      n := n + 1;
      nick := me.display_name || ' ' || n;
    end loop;
    insert into public.group_members (id, group_id, nickname, color, user_id, role)
      values (gen_random_uuid(), inv.group_id, nick, me.avatar_color, auth.uid(), 'member');
  end if;
  update public.group_invites set uses = uses + 1 where token = inv.token;
  return inv.group_id;
end;
$$;

-- Viewer taps "This is me" on a night they're watching (requires a real login).
create or replace function public.claim_member_via_session(session_id uuid, member_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.sessions; mid uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'sign in first';
  end if;
  select * into s from public.sessions where id = session_id;
  if not found or not public.can_view_session(s.id) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.group_members where group_id = s.group_id and user_id = auth.uid()) then
    raise exception 'you already have a profile in this group';
  end if;
  update public.group_members set user_id = auth.uid(), updated_at = now()
    where id = member_id and group_id = s.group_id and user_id is null
    returning id into mid;
  if mid is null then raise exception 'that profile is already claimed'; end if;
  return s.group_id;
end;
$$;

create or replace function public.transfer_ownership(group_id uuid, member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups; target public.group_members;
begin
  select * into g from public.groups where id = group_id for update;
  if not found or g.owner_id is distinct from auth.uid() then raise exception 'only the owner can do this'; end if;
  select * into target from public.group_members m where m.id = member_id and m.group_id = g.id;
  if not found or target.user_id is null then raise exception 'new owner needs an account'; end if;
  update public.group_members m set role = 'admin', updated_at = now()
    where m.group_id = g.id and m.user_id = auth.uid();
  update public.group_members m set role = 'owner', updated_at = now() where m.id = target.id;
  update public.groups set owner_id = target.user_id, updated_at = now() where id = g.id;
end;
$$;

create or replace function public.delete_me()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Unlink claimed members; group history keeps the nickname.
  update public.group_members set user_id = null, role = case when role = 'owner' then 'admin' else role end,
    updated_at = now() where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.redeem_view_token, public.transfer_host, public.offer_host, public.accept_host,
  public.force_takeover, public.heartbeat, public.rotate_view_token, public.join_group,
  public.claim_member_via_session, public.transfer_ownership, public.delete_me from anon, public;
grant execute on function public.redeem_view_token, public.transfer_host, public.offer_host, public.accept_host,
  public.force_takeover, public.heartbeat, public.rotate_view_token, public.join_group,
  public.claim_member_via_session, public.transfer_ownership, public.delete_me to authenticated;

-- Realtime on events (RLS applies).
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.sessions;
