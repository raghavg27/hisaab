-- Upserts (INSERT … ON CONFLICT DO UPDATE) also check the SELECT policy against the new row.
-- The creator's own owner row isn't visible through is_group_member until it exists, so let
-- users always see their own member rows.
drop policy members_select on public.group_members;
create policy members_select on public.group_members for select
  using (
    user_id = auth.uid()
    or public.is_group_member(group_id)
    or exists (
      select 1 from public.sessions s
      where s.group_id = group_members.group_id and public.is_session_viewer(s.id)
    )
  );

-- Same for sessions: can_view_session looks the row up by id, which misses the row being
-- inserted. Check the row's own group directly.
drop policy sessions_select on public.sessions;
create policy sessions_select on public.sessions for select
  using (public.is_group_member(group_id) or public.is_session_viewer(id));
