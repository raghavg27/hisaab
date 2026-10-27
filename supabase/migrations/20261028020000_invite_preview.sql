-- What /join/[token] shows before joining: the group and the names nobody has claimed yet.
-- Invite rows are only visible to members, so this is a security-definer read.
create or replace function public.invite_preview(invite_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare inv public.group_invites; g public.groups;
begin
  select * into inv from public.group_invites where token = invite_token;
  if not found or inv.expires_at < now() or (inv.max_uses is not null and inv.uses >= inv.max_uses) then
    raise exception 'invite expired' using errcode = 'P0002';
  end if;
  select * into g from public.groups where id = inv.group_id and deleted_at is null;
  if not found then raise exception 'invite expired' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'group_id', g.id,
    'name', g.name,
    'emoji', g.emoji,
    'member', public.is_group_member(g.id),
    'unclaimed', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nickname', m.nickname, 'color', m.color) order by m.nickname)
      from public.group_members m
      where m.group_id = g.id and m.user_id is null and m.archived_at is null
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.invite_preview from anon, public;
grant execute on function public.invite_preview to authenticated;
