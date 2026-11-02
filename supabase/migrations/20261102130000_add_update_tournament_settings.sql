-- Add update_tournament_settings: the only write path for a tournament's name and points.
--
-- Invariants enforced here (independent of application code):
--   * only the owner can change a tournament; anyone else (or anon) gets not_found
--   * points cannot change once any match of the tournament has a result
--   * the points lock is race-safe: this function locks the tournament row FOR UPDATE and
--     submit_match_score locks it FOR SHARE, so a score and a points edit are strictly ordered
--   * name/points validity stays with the existing tournaments_*_check constraints
--   * there is still no UPDATE policy on tournaments; direct table updates stay impossible

-- ---------------------------------------------------------------------------
-- update_tournament_settings
-- Returns {"status": "updated" | "not_found" | "points_locked"}.
-- not_found: no tournament with that id owned by auth.uid() (also covers anon / no session).
-- points_locked: points are non-null, differ from the stored values, and a result exists. Nothing is written.
-- Null points mean "leave points unchanged"; points must be all-null or all-non-null (22023 otherwise).
-- Points equal to the stored values count as unchanged. Check violations (23514) are not swallowed.
-- ---------------------------------------------------------------------------
create function public.update_tournament_settings(
  p_tournament_id uuid,
  p_name text,
  p_points_win int,
  p_points_draw int,
  p_points_loss int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_win int;
  v_draw int;
  v_loss int;
  v_points_given boolean;
begin
  if (p_points_win is null) <> (p_points_draw is null) or (p_points_draw is null) <> (p_points_loss is null) then
    raise exception 'points must be all null or all non-null' using errcode = '22023';
  end if;
  v_points_given := p_points_win is not null;

  select t.points_win, t.points_draw, t.points_loss
  into v_win, v_draw, v_loss
  from public.tournaments t
  where t.id = p_tournament_id and t.owner_id = (select auth.uid())
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_points_given
    and (p_points_win, p_points_draw, p_points_loss) is distinct from (v_win, v_draw, v_loss)
    and exists (
      select 1
      from public.results r
      join public.matches m on m.id = r.match_id
      where m.tournament_id = p_tournament_id
    )
  then
    return jsonb_build_object('status', 'points_locked');
  end if;

  update public.tournaments
  set name = btrim(p_name),
      points_win = coalesce(p_points_win, points_win),
      points_draw = coalesce(p_points_draw, points_draw),
      points_loss = coalesce(p_points_loss, points_loss)
  where id = p_tournament_id;

  return jsonb_build_object('status', 'updated');
end;
$$;

revoke execute on function public.update_tournament_settings(uuid, text, int, int, int) from public, anon;
grant execute on function public.update_tournament_settings(uuid, text, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_match_score: replaced to take a shared lock on the tournament row before inserting,
-- so it is ordered against update_tournament_settings. Same signature, return contract and grants.
-- ---------------------------------------------------------------------------
create or replace function public.submit_match_score(
  p_token text,
  p_match_id uuid,
  p_score_a int,
  p_score_b int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
begin
  select m.id
  into v_match_id
  from public.tournaments t
  join public.matches m on m.tournament_id = t.id
  where t.share_token = p_token and m.id = p_match_id
  for share of t;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Race-safe write-once: the primary key arbitrates concurrent submissions; no row means we lost.
  insert into public.results (match_id, score_a, score_b)
  values (v_match_id, p_score_a, p_score_b)
  on conflict (match_id) do nothing
  returning match_id into v_match_id;

  if not found then
    return jsonb_build_object('status', 'already_entered');
  end if;

  return jsonb_build_object('status', 'created');
end;
$$;

revoke execute on function public.submit_match_score(text, uuid, int, int) from public;
grant execute on function public.submit_match_score(text, uuid, int, int) to anon, authenticated;
