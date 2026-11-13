-- Add the cup (single-elimination) format next to the round-robin league.
--
-- Invariants enforced here (independent of application code):
--   * a tournament is either a 'league' or a 'cup'; every existing row backfills to 'league'
--   * a league match still needs two players; only a cup match (round is not null) may have an empty slot,
--     which is filled later by winner advancement
--   * a cup can only be created through create_cup, with 3-20 players and exactly n-1 consistent matches
--     (every slot is either a player or fed by exactly one earlier match, every player sits in one slot)
--   * a cup match accepts no draw and no score until both slots are filled
--   * a cup winner is written into the next match's slot in the same transaction as the result
--   * a correction that would change the winner is refused once the next match has a result
--
-- Additive and backward compatible: league behaviour, create_league and every existing RPC signature stay.

-- ---------------------------------------------------------------------------
-- tournaments.format
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column format text not null default 'league',
  add constraint tournaments_format_check check (format in ('league', 'cup'));

-- ---------------------------------------------------------------------------
-- matches: bracket columns, nullable player slots
-- ---------------------------------------------------------------------------
alter table public.matches
  add column round int,
  add column next_match_id uuid,
  add column next_slot text,
  add constraint matches_round_check check (round is null or round > 0),
  add constraint matches_next_slot_check check (next_slot in ('a', 'b')),
  alter column player_a_id drop not null,
  alter column player_b_id drop not null,
  add constraint matches_league_players_check check (
    round is not null or (player_a_id is not null and player_b_id is not null)
  ),
  add constraint matches_next_link_check check ((next_match_id is null) = (next_slot is null));

-- The next match must belong to the same tournament: composite FK onto (tournament_id, id). A null next_match_id
-- skips the FK (MATCH SIMPLE). Deleting a tournament still cascades through tournament_id and through this link.
alter table public.matches
  add constraint matches_tournament_id_id_key unique (tournament_id, id);

alter table public.matches
  add constraint matches_next_match_fkey foreign key (tournament_id, next_match_id)
    references public.matches (tournament_id, id) on delete cascade;

-- Supports the cascade/lookup on the self-reference (every deleted match scans for the matches that point at it).
create index matches_next_match_id_idx on public.matches (next_match_id) where next_match_id is not null;

-- ---------------------------------------------------------------------------
-- create_cup: writes a whole cup in one transaction (security definer, caller becomes the owner).
-- p_bracket is a JSON array of {round, position, a, b, next_position, next_slot}: a/b are 0-based indices into
-- p_players or null (filled by advancement); next_position/next_slot are null for the final.
-- Raises 22023 for bad counts, indices or links, 42501 without a signed-in user, 23505 for duplicate names.
-- ---------------------------------------------------------------------------
create function public.create_cup(
  p_name text,
  p_players text[],
  p_bracket jsonb
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
  v_match_ids uuid[];
begin
  if v_owner_id is null then
    raise exception 'create_cup: a signed-in user is required' using errcode = '42501';
  end if;

  if v_player_count not between 3 and 20 then
    raise exception 'create_cup: expected 3-20 players, got %', v_player_count
      using errcode = '22023';
  end if;

  if p_bracket is null or jsonb_typeof(p_bracket) <> 'array'
     or jsonb_array_length(p_bracket) <> v_player_count - 1 then
    raise exception 'create_cup: expected % bracket matches for % players', v_player_count - 1, v_player_count
      using errcode = '22023';
  end if;

  -- Shape: every element is an object with integer round/position, integer-or-null a/b/next_position, text-or-null next_slot.
  if exists (
    select 1
    from jsonb_array_elements(p_bracket) as e (value)
    where jsonb_typeof(e.value) <> 'object'
       or coalesce(e.value ->> 'round', '') !~ '^[0-9]{1,4}$'
       or coalesce(e.value ->> 'position', '') !~ '^[0-9]{1,4}$'
       or coalesce(jsonb_typeof(e.value -> 'a'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(e.value -> 'b'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(e.value -> 'next_position'), 'null') not in ('number', 'null')
       or coalesce(jsonb_typeof(e.value -> 'next_slot'), 'null') not in ('string', 'null')
       or coalesce(e.value ->> 'a', '0') !~ '^[0-9]{1,4}$'
       or coalesce(e.value ->> 'b', '0') !~ '^[0-9]{1,4}$'
       or coalesce(e.value ->> 'next_position', '0') !~ '^[0-9]{1,4}$'
  ) then
    raise exception 'create_cup: each bracket match must be {round, position, a, b, next_position, next_slot}'
      using errcode = '22023';
  end if;

  create temporary table pg_temp.cup_bracket on commit drop as
  select x.round, x.position, x.a, x.b, x.next_position, x.next_slot
  from jsonb_to_recordset(p_bracket) as x (
    round int, position int, a int, b int, next_position int, next_slot text
  );

  if (select count(distinct position) <> v_player_count - 1 or min(position) <> 1 or max(position) <> v_player_count - 1
      from pg_temp.cup_bracket) then
    raise exception 'create_cup: bracket positions must be unique and cover 1-%', v_player_count - 1
      using errcode = '22023';
  end if;

  if exists (select 1 from pg_temp.cup_bracket where round < 1) then
    raise exception 'create_cup: bracket rounds must start at 1' using errcode = '22023';
  end if;

  if exists (
    select 1 from pg_temp.cup_bracket
    where a not between 0 and v_player_count - 1 or b not between 0 and v_player_count - 1
  ) then
    raise exception 'create_cup: bracket has a player index out of range 0-%', v_player_count - 1
      using errcode = '22023';
  end if;

  -- Every player sits in exactly one starting slot, and no match pits a player against themselves.
  if exists (select 1 from pg_temp.cup_bracket where a = b)
     or (
       select count(*) <> v_player_count or count(distinct idx) <> v_player_count
       from (select a as idx from pg_temp.cup_bracket union all select b from pg_temp.cup_bracket) s
       where idx is not null
     ) then
    raise exception 'create_cup: every player must appear in exactly one starting slot'
      using errcode = '22023';
  end if;

  -- Links: only the final has no next match; a link points at a later round and a/b; a slot is fed at most once.
  if (select count(*) filter (where next_position is null) <> 1 from pg_temp.cup_bracket)
     or exists (
       select 1 from pg_temp.cup_bracket
       where (next_position is null) <> (next_slot is null)
          or next_slot not in ('a', 'b')
     )
     or exists (
       select 1
       from pg_temp.cup_bracket s
       left join pg_temp.cup_bracket t on t.position = s.next_position
       where s.next_position is not null and (t.position is null or t.round <= s.round)
     )
     or exists (
       select 1 from pg_temp.cup_bracket
       where next_position is not null
       group by next_position, next_slot
       having count(*) > 1
     ) then
    raise exception 'create_cup: inconsistent next-match links' using errcode = '22023';
  end if;

  -- Every slot is either a player or fed by exactly one match, never both and never neither.
  if exists (
    select 1
    from pg_temp.cup_bracket m
    cross join (values ('a'), ('b')) as slot (name)
    where (case when slot.name = 'a' then m.a is not null else m.b is not null end)::int
        + (select count(*) from pg_temp.cup_bracket f where f.next_position = m.position and f.next_slot = slot.name)::int
        <> 1
  ) then
    raise exception 'create_cup: every slot must be a player or fed by exactly one match' using errcode = '22023';
  end if;

  insert into public.tournaments (owner_id, name, points_win, points_draw, points_loss, format)
  values (v_owner_id, btrim(p_name), 0, 0, 0, 'cup')
  returning id into v_tournament_id;

  -- Pre-generate ids so player index i maps to v_player_ids[i + 1] and position p to v_match_ids[p].
  -- Duplicate names (case-insensitive) fail here with 23505 from players_tournament_id_lower_name_key.
  v_player_ids := array(select gen_random_uuid() from generate_series(1, v_player_count));
  v_match_ids := array(select gen_random_uuid() from generate_series(1, v_player_count - 1));

  insert into public.players (id, tournament_id, name)
  select p.id, v_tournament_id, btrim(p.name)
  from unnest(v_player_ids, p_players) as p (id, name);

  insert into public.matches (id, tournament_id, position, round, player_a_id, player_b_id)
  select v_match_ids[b.position], v_tournament_id, b.position, b.round,
         v_player_ids[b.a + 1], v_player_ids[b.b + 1]
  from pg_temp.cup_bracket b;

  -- Second pass: link each match to the slot its winner moves into.
  update public.matches m
  set next_match_id = v_match_ids[b.next_position],
      next_slot = b.next_slot
  from pg_temp.cup_bracket b
  where m.id = v_match_ids[b.position] and b.next_position is not null;

  drop table pg_temp.cup_bracket;

  return v_tournament_id;
end;
$$;

revoke execute on function public.create_cup(text, text[], jsonb) from public, anon;
grant execute on function public.create_cup(text, text[], jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- submit_match_score: replaced with a cup branch. The league branch is the previous body, unchanged.
-- Returns {"status": "created" | "already_entered" | "not_found" | "not_ready" | "draw_not_allowed"}.
-- not_ready (cup): a player slot is still empty. draw_not_allowed (cup): equal scores; nothing is stored.
-- For a cup the winner is written into the next match's slot in the same transaction, under the same
-- tournament row lock.
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
  v_tournament_id uuid;
  v_match_id uuid;
  v_format text;
  v_player_a uuid;
  v_player_b uuid;
  v_next_match_id uuid;
  v_next_slot text;
begin
  -- Lock the tournament row in its own statement first, so the match and slot values below are read after the
  -- lock (a concurrent owner correction that rewrites a slot has committed or is waiting on us).
  select t.id, t.format
  into v_tournament_id, v_format
  from public.tournaments t
  where t.share_token = p_token
  for share;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select m.id, m.player_a_id, m.player_b_id, m.next_match_id, m.next_slot
  into v_match_id, v_player_a, v_player_b, v_next_match_id, v_next_slot
  from public.matches m
  where m.id = p_match_id and m.tournament_id = v_tournament_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_format = 'cup' then
    if v_player_a is null or v_player_b is null then
      return jsonb_build_object('status', 'not_ready');
    end if;

    if p_score_a = p_score_b then
      return jsonb_build_object('status', 'draw_not_allowed');
    end if;
  end if;

  -- Race-safe write-once: the primary key arbitrates concurrent submissions; no row means we lost.
  insert into public.results (match_id, score_a, score_b)
  values (v_match_id, p_score_a, p_score_b)
  on conflict (match_id) do nothing
  returning match_id into v_match_id;

  if not found then
    return jsonb_build_object('status', 'already_entered');
  end if;

  if v_format = 'cup' and v_next_match_id is not null then
    update public.matches
    set player_a_id = case when v_next_slot = 'a' then case when p_score_a > p_score_b then v_player_a else v_player_b end
                           else player_a_id end,
        player_b_id = case when v_next_slot = 'b' then case when p_score_a > p_score_b then v_player_a else v_player_b end
                           else player_b_id end
    where id = v_next_match_id;
  end if;

  return jsonb_build_object('status', 'created');
end;
$$;

revoke execute on function public.submit_match_score(text, uuid, int, int) from public;
grant execute on function public.submit_match_score(text, uuid, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cup correction guard: BEFORE UPDATE on results (the owner correction path, direct UPDATE through RLS).
-- League results pass untouched. For a cup: a draw is refused (P0001, hint cup_draw_not_allowed); an unchanged winner is allowed;
-- a changed winner is refused with 55000 'cup_next_round_played' once the next match has a result,
-- otherwise the next match's slot is rewritten with the new winner.
-- security definer because the owner has no UPDATE policy on matches.
-- ---------------------------------------------------------------------------
create function public.guard_cup_result_update() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tournament_id uuid;
  v_format text;
  v_player_a uuid;
  v_player_b uuid;
  v_next_match_id uuid;
  v_next_slot text;
  v_new_winner uuid;
begin
  -- The format never changes after creation, so read it without a lock: a league correction takes no lock at all.
  select t.id, t.format
  into v_tournament_id, v_format
  from public.matches m
  join public.tournaments t on t.id = m.tournament_id
  where m.id = new.match_id;

  if not found or v_format <> 'cup' then
    return new;
  end if;

  -- Cup only. Same lock as submit_match_score (FOR SHARE) and update_tournament_settings (FOR UPDATE): a correction
  -- is strictly ordered against a concurrent score for the next match. Taken in its own statement, before the
  -- match/slot values are read.
  perform 1 from public.tournaments t where t.id = v_tournament_id for update;

  select m.player_a_id, m.player_b_id, m.next_match_id, m.next_slot
  into v_player_a, v_player_b, v_next_match_id, v_next_slot
  from public.matches m
  where m.id = new.match_id;

  if new.score_a = new.score_b then
    -- P0001 with its own hint, so callers never have to tell a draw from a range check (23514) by message text.
    raise exception 'a cup match cannot end in a draw' using errcode = 'P0001', hint = 'cup_draw_not_allowed';
  end if;

  -- The old result was never a draw (same rule on insert), so the winner flips only when the order flips.
  if (new.score_a > new.score_b) = (old.score_a > old.score_b) then
    return new;
  end if;

  if v_next_match_id is null then
    return new;
  end if;

  if exists (select 1 from public.results r where r.match_id = v_next_match_id) then
    raise exception 'cup_next_round_played' using errcode = '55000';
  end if;

  v_new_winner := case when new.score_a > new.score_b then v_player_a else v_player_b end;

  update public.matches
  set player_a_id = case when v_next_slot = 'a' then v_new_winner else player_a_id end,
      player_b_id = case when v_next_slot = 'b' then v_new_winner else player_b_id end
  where id = v_next_match_id;

  return new;
end;
$$;

revoke execute on function public.guard_cup_result_update() from public, anon, authenticated;

create trigger results_guard_cup_update
  before update on public.results
  for each row execute function public.guard_cup_result_update();

-- ---------------------------------------------------------------------------
-- get_shared_league: replaced with format and bracket keys. Every existing key and the match order stay.
-- Adds league.format and, per match, round and next_match_id (both null for a league); player ids can be
-- null for a cup. Still exposes no owner_id, tournament id or share token.
-- ---------------------------------------------------------------------------
create or replace function public.get_shared_league(p_token text) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'league', jsonb_build_object(
      'name', t.name,
      'points_win', t.points_win,
      'points_draw', t.points_draw,
      'points_loss', t.points_loss,
      'format', t.format
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.name, p.id)
      from public.players p
      where p.tournament_id = t.id
    ), '[]'::jsonb),
    'matches', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'position', m.position,
          'player_a_id', m.player_a_id,
          'player_b_id', m.player_b_id,
          'score_a', r.score_a,
          'score_b', r.score_b,
          'round', m.round,
          'next_match_id', m.next_match_id
        )
        order by m.position
      )
      from public.matches m
      left join public.results r on r.match_id = m.id
      where m.tournament_id = t.id
    ), '[]'::jsonb)
  )
  from public.tournaments t
  where t.share_token = p_token;
$$;

revoke execute on function public.get_shared_league(text) from public;
grant execute on function public.get_shared_league(text) to anon, authenticated;
