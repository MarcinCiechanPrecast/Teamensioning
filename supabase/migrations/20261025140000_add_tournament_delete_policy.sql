-- Let an organizer delete their own tournament.
--
-- Invariants enforced here (independent of application code):
--   * only the owner of a tournament may delete it; anon has no DELETE policy
--   * players, matches and results go with it via their existing `on delete cascade`
--     foreign keys (referential actions are not subject to RLS, so no child policies are needed)

create policy "tournaments_delete_own" on public.tournaments
  for delete to authenticated
  using (owner_id = (select auth.uid()));
