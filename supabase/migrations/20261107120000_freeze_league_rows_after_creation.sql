-- Freeze a league's rows after creation: create_league becomes the only way to write tournaments, players
-- and matches.
--
-- Invariants enforced here (independent of application code):
--   * players and matches can only be written inside create_league, in the same transaction as their
--     tournament, so the player list is fixed and every pair meets exactly once (PRD Guardrail 2, Non-Goals)
--   * a tournament can only be created together with its 3-20 players and all n*(n-1)/2 fixtures
--   * create_league requires a signed-in caller and makes that caller the owner
--
-- Backward compatible: create_league keeps its signature, return value, error codes (23505 duplicate name,
-- 22023 bad counts) and grants; the deployed app never inserts into these tables directly.

-- ---------------------------------------------------------------------------
-- create_league: now security definer (it no longer relies on the insert policies dropped below).
-- Same body as 20261023120000_create_league_schema.sql, plus the explicit auth.uid() check and owner_id.
-- ---------------------------------------------------------------------------
create or replace function public.create_league(
  p_name text,
  p_points_win int,
  p_points_draw int,
  p_points_loss int,
  p_players text[],
  p_fixtures jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_player_count int := coalesce(array_length(p_players, 1), 0);
  v_tournament_id uuid;
  v_player_ids uuid[];
  v_fixture jsonb;
  v_position int;
  v_a int;
  v_b int;
begin
  -- RLS no longer applies inside this function, so the caller check is explicit.
  if v_owner_id is null then
    raise exception 'create_league: a signed-in user is required' using errcode = '42501';
  end if;

  if v_player_count not between 3 and 20 then
    raise exception 'create_league: expected 3-20 players, got %', v_player_count
      using errcode = '22023';
  end if;

  if p_fixtures is null or jsonb_typeof(p_fixtures) <> 'array'
     or jsonb_array_length(p_fixtures) <> v_player_count * (v_player_count - 1) / 2 then
    raise exception 'create_league: expected % fixtures for % players',
      v_player_count * (v_player_count - 1) / 2, v_player_count
      using errcode = '22023';
  end if;

  insert into public.tournaments (owner_id, name, points_win, points_draw, points_loss)
  values (v_owner_id, btrim(p_name), p_points_win, p_points_draw, p_points_loss)
  returning id into v_tournament_id;

  -- Pre-generate player ids so fixture index i maps to v_player_ids[i + 1].
  -- Duplicate names (case-insensitive) fail here with 23505 from players_tournament_id_lower_name_key.
  v_player_ids := array(select gen_random_uuid() from generate_series(1, v_player_count));

  insert into public.players (id, tournament_id, name)
  select p.id, v_tournament_id, btrim(p.name)
  from unnest(v_player_ids, p_players) as p (id, name);

  for v_fixture, v_position in
    select f.value, f.ord::int
    from jsonb_array_elements(p_fixtures) with ordinality as f (value, ord)
  loop
    if coalesce(jsonb_typeof(v_fixture -> 'a'), '') <> 'number'
       or coalesce(jsonb_typeof(v_fixture -> 'b'), '') <> 'number' then
      raise exception 'create_league: fixture % must be {"a": int, "b": int}', v_position
        using errcode = '22023';
    end if;

    v_a := (v_fixture ->> 'a')::int;
    v_b := (v_fixture ->> 'b')::int;

    if v_a not between 0 and v_player_count - 1 or v_b not between 0 and v_player_count - 1 then
      raise exception 'create_league: fixture % has a player index out of range 0-%', v_position, v_player_count - 1
        using errcode = '22023';
    end if;

    insert into public.matches (tournament_id, position, player_a_id, player_b_id)
    values (v_tournament_id, v_position, v_player_ids[v_a + 1], v_player_ids[v_b + 1]);
  end loop;

  return v_tournament_id;
end;
$$;

revoke execute on function public.create_league(text, int, int, int, text[], jsonb) from public, anon;
grant execute on function public.create_league(text, int, int, int, text[], jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Direct inserts: no INSERT policy remains on tournaments, players or matches (RLS stays enabled),
-- so a direct insert by anyone is refused with 42501.
-- ---------------------------------------------------------------------------
drop policy if exists "tournaments_insert_own" on public.tournaments;
drop policy if exists "players_insert_own" on public.players;
drop policy if exists "matches_insert_own" on public.matches;
