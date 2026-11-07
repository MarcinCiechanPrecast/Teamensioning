-- DELIBERATE BREAK for the migration-upgrade gate proof (test-plan Phase 4); reverted in the next commit.
-- An empty database accepts this constraint; data already holding non-ASCII player names does not.
alter table public.players
  add constraint players_name_ascii_check check (name ~ '^[ -~]+$');
