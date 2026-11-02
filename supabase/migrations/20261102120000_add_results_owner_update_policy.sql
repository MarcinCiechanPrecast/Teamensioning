-- Organizer score correction: the tournament owner may overwrite an existing result.
--
-- Invariants enforced here (independent of application code):
--   * corrections are owner-only: only the owner of the match's tournament can update its result
--   * only score_a / score_b are writable, so match_id can never be repointed to another match
--   * a correction overwrites the row in place; there is no history
--   * no anon policy, no insert/delete policy: link holders still cannot overwrite (submit_match_score stays write-once)
--   * the 0-99 check constraints still apply to updates (23514)

create policy "results_update_own" on public.results
  for update to authenticated
  using (exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = results.match_id and t.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    where m.id = results.match_id and t.owner_id = (select auth.uid())
  ));

revoke update on public.results from authenticated;
grant update (score_a, score_b) on public.results to authenticated;
