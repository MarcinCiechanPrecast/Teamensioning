-- Add shared league link: a per-tournament secret share token and the single anonymous read path.
--
-- Invariants enforced here (independent of application code):
--   * every tournament has a unique, unguessable share token (64 lowercase hex chars)
--   * anon has no table access; the only anonymous read is get_shared_league(token)
--   * get_shared_league never exposes owner_id, the tournament id or the share token

-- ---------------------------------------------------------------------------
-- tournaments.share_token
-- Adding the column with a default backfills existing rows.
-- The existing tournaments_select_own policy already lets the owner read it.
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column share_token text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

alter table public.tournaments
  add constraint tournaments_share_token_key unique (share_token),
  add constraint tournaments_share_token_check check (share_token ~ '^[0-9a-f]{64}$');

-- ---------------------------------------------------------------------------
-- get_shared_league: the only anonymous read path (security definer, bypasses RLS).
-- Returns null when no tournament matches the token; otherwise
-- {league: {name, points_win, points_draw, points_loss}, players: [{id, name}],
--  matches: [{id, position, player_a_id, player_b_id}]} with matches ordered by position.
-- ---------------------------------------------------------------------------
create function public.get_shared_league(p_token text) returns jsonb
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
          'player_b_id', m.player_b_id
        )
        order by m.position
      )
      from public.matches m
      where m.tournament_id = t.id
    ), '[]'::jsonb)
  )
  from public.tournaments t
  where t.share_token = p_token;
$$;

revoke execute on function public.get_shared_league(text) from public;
grant execute on function public.get_shared_league(text) to anon, authenticated;
