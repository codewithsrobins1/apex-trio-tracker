-- ============================================================
-- Apex Trio Tracker — DEV RESET
-- Clears ALL DATA but keeps tables, schema, and policies
-- Safe to re-run in development
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Core session / RP data (order does not matter with CASCADE)
-- ------------------------------------------------------------
truncate table
  public.session_rp_deltas,
  public.season_rp_snapshots,
  public.session_posts,
  public.rp_entries,
  public.session_player_stats,
  public.game_sessions,
  public.sessions,
  public.season_players,
  public.seasons
restart identity cascade;

-- ------------------------------------------------------------
-- Optional: clear viewers / misc tables
-- ------------------------------------------------------------
-- Uncomment if you want this wiped too
-- truncate table public."Live Viewers" restart identity cascade;

commit;

-- ------------------------------------------------------------
-- Sanity Check -- count should be 0
-- ------------------------------------------------------------
select
  'seasons' as table, count(*) from public.seasons
union all
select 'season_players', count(*) from public.season_players
union all
select 'rp_entries', count(*) from public.rp_entries
union all
select 'season_rp_snapshots', count(*) from public.season_rp_snapshots
union all
select 'session_posts', count(*) from public.session_posts;
