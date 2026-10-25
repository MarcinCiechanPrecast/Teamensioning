-- Add match results: write-once score storage and the single anonymous write path.
--
-- Invariants enforced here (independent of application code):
--   * a match has at most one result (match_id is the primary key); the first submission wins
--   * scores are integers between 0 and 99
--   * anon has no table access; the only anonymous write is submit_match_score(token, match, a, b)
--   * a score can only be submitted for a match that belongs to the tournament named by the token
--   * get_shared_league exposes score_a/score_b (null when unplayed) and still hides owner_id, tournament id and token

-- ---------------------------------------------------------------------------
-- results
-- ---------------------------------------------------------------------------
create table public.results (
  match_id uuid primary key references public.matches (id) on delete cascade,
  score_a int not null,
  score_b int not null,
  created_at timestamptz not null default now(),
  constraint results_score_a_check check (score_a between 0 and 99),
  constraint results_score_b_check check (score_b between 0 and 99)
);

-- ---------------------------------------------------------------------------
-- row level security
-- No anon policies; no insert/update/delete policies (writes go through submit_match_score,
-- corrections are added by a later slice).
-- ---------------------------------------------------------------------------
alter table public.results enable row level security;

create policy "results_select_own" on public.results
  for select to authenticated
  using (exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = results.match_id and t.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- submit_match_score: the only anonymous write path (security definer, bypasses RLS).
-- Returns {"status": "created" | "already_entered" | "not_found"}.
-- not_found: unknown token, or the match does not belong to the token's tournament.
-- already_entered: a result already exists; the stored score is kept untouched.
-- Out-of-range scores raise the results_score_*_check violation (23514); it is not swallowed.
-- ---------------------------------------------------------------------------
create function public.submit_match_score(
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
  where t.share_token = p_token and m.id = p_match_id;

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

-- ---------------------------------------------------------------------------
-- get_shared_league: replaced so each match also carries its score.
-- Returns null when no tournament matches the token; otherwise
-- {league: {name, points_win, points_draw, points_loss}, players: [{id, name}],
--  matches: [{id, position, player_a_id, player_b_id, score_a, score_b}]} with matches ordered by position.
-- score_a and score_b are null when the match has no result yet.
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
      'points_loss', t.points_loss
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
          'score_b', r.score_b
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
