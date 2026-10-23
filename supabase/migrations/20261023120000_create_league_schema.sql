-- Create league schema: tournaments, players and matches with DB-level invariants,
-- per-operation RLS for authenticated users, and the transactional create_league RPC.
--
-- Invariants enforced here (independent of application code):
--   * tournament and player names are trimmed and length-bounded
--   * player names are unique per tournament, case-insensitively
--   * both players of a match belong to the match's tournament
--   * every unordered pair of players meets at most once per tournament
--   * create_league writes exactly n*(n-1)/2 matches for 3-20 players, so each pair meets exactly once

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  points_win smallint not null,
  points_draw smallint not null,
  points_loss smallint not null,
  created_at timestamptz not null default now(),
  constraint tournaments_name_check check (name = btrim(name) and char_length(name) between 1 and 80),
  constraint tournaments_points_win_check check (points_win between 0 and 99),
  constraint tournaments_points_draw_check check (points_draw between 0 and 99),
  constraint tournaments_points_loss_check check (points_loss between 0 and 99),
  constraint tournaments_points_order_check check (points_win >= points_draw and points_draw >= points_loss)
);

create index tournaments_owner_id_idx on public.tournaments (owner_id);

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  name text not null,
  constraint players_name_check check (name = btrim(name) and char_length(name) between 1 and 40),
  -- target for the composite FKs on matches
  constraint players_tournament_id_id_key unique (tournament_id, id)
);

create index players_tournament_id_idx on public.players (tournament_id);
create unique index players_tournament_id_lower_name_key on public.players (tournament_id, lower(name));

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments on delete cascade,
  position int not null,
  player_a_id uuid not null,
  player_b_id uuid not null,
  constraint matches_position_check check (position > 0),
  constraint matches_distinct_players_check check (player_a_id <> player_b_id),
  constraint matches_tournament_id_position_key unique (tournament_id, position),
  constraint matches_player_a_fkey foreign key (tournament_id, player_a_id)
    references public.players (tournament_id, id) on delete cascade,
  constraint matches_player_b_fkey foreign key (tournament_id, player_b_id)
    references public.players (tournament_id, id) on delete cascade
);

create unique index matches_tournament_id_pair_key on public.matches (
  tournament_id,
  least(player_a_id, player_b_id),
  greatest(player_a_id, player_b_id)
);

-- ---------------------------------------------------------------------------
-- row level security
-- No anon policies; UPDATE and DELETE policies are added by later slices.
-- ---------------------------------------------------------------------------
alter table public.tournaments enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;

create policy "tournaments_select_own" on public.tournaments
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "tournaments_insert_own" on public.tournaments
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "players_select_own" on public.players
  for select to authenticated
  using (exists (
    select 1 from public.tournaments t
    where t.id = players.tournament_id and t.owner_id = (select auth.uid())
  ));

create policy "players_insert_own" on public.players
  for insert to authenticated
  with check (exists (
    select 1 from public.tournaments t
    where t.id = players.tournament_id and t.owner_id = (select auth.uid())
  ));

create policy "matches_select_own" on public.matches
  for select to authenticated
  using (exists (
    select 1 from public.tournaments t
    where t.id = matches.tournament_id and t.owner_id = (select auth.uid())
  ));

create policy "matches_insert_own" on public.matches
  for insert to authenticated
  with check (exists (
    select 1 from public.tournaments t
    where t.id = matches.tournament_id and t.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- create_league: writes a whole league in one transaction, with RLS applied (security invoker).
-- p_fixtures is a JSON array of {"a": int, "b": int}: 0-based indices into p_players, in display order.
-- ---------------------------------------------------------------------------
create function public.create_league(
  p_name text,
  p_points_win int,
  p_points_draw int,
  p_points_loss int,
  p_players text[],
  p_fixtures jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_player_count int := coalesce(array_length(p_players, 1), 0);
  v_tournament_id uuid;
  v_player_ids uuid[];
  v_fixture jsonb;
  v_position int;
  v_a int;
  v_b int;
begin
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

  insert into public.tournaments (name, points_win, points_draw, points_loss)
  values (btrim(p_name), p_points_win, p_points_draw, p_points_loss)
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
