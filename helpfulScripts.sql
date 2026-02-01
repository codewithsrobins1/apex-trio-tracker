-- ============================================================
-- Apex Trio Tracker — HELPFUL ADMIN SCRIPTS
-- ============================================================


-- ============================================================
-- 1. RESET ALL DATA (keeps tables, schema, and policies)
-- ============================================================

BEGIN;

-- Clear all data from tables (order matters for foreign keys)
TRUNCATE TABLE
  public.discord_posts,
  public.season_rp_entries,
  public.player_game_stats,
  public.game_stats,
  public.live_session_players,
  public.live_sessions,
  public.season_players,
  public.seasons,
  public.sessions,
  public.profiles
RESTART IDENTITY CASCADE;

-- Note: This will also delete auth.users data linkage
-- You may need to delete users from Auth dashboard separately

COMMIT;

-- Verify all tables are empty
SELECT 'profiles' as table_name, count(*) as row_count FROM public.profiles
UNION ALL SELECT 'seasons', count(*) FROM public.seasons
UNION ALL SELECT 'season_players', count(*) FROM public.season_players
UNION ALL SELECT 'sessions', count(*) FROM public.sessions
UNION ALL SELECT 'live_sessions', count(*) FROM public.live_sessions
UNION ALL SELECT 'season_rp_entries', count(*) FROM public.season_rp_entries;


-- ============================================================
-- 2. VIEW ALL USERS AND THEIR PASSWORDS
-- ============================================================
-- Note: Supabase hashes passwords, so you can't see the actual password.
-- But you can see user info and RESET passwords.

-- View all users with their profile info
SELECT 
  au.id,
  au.email,
  p.username,
  p.display_name,
  au.created_at,
  au.last_sign_in_at
FROM auth.users au
LEFT JOIN public.profiles p ON au.id = p.id
ORDER BY au.created_at DESC;


-- ============================================================
-- 3. RESET A USER'S PASSWORD
-- ============================================================
-- Replace 'newpassword123' and the username

-- First, find the user's ID by username
SELECT id, email FROM auth.users 
WHERE email LIKE 'USERNAME_HERE@apex.local';

-- Then update their password (replace USER_ID_HERE and NEW_PASSWORD)
-- Note: This uses Supabase's built-in password hashing
UPDATE auth.users 
SET encrypted_password = crypt('NEW_PASSWORD_HERE', gen_salt('bf'))
WHERE id = 'USER_ID_HERE';

-- OR do it in one query by username:
UPDATE auth.users 
SET encrypted_password = crypt('NEW_PASSWORD_HERE', gen_salt('bf'))
WHERE email = 'USERNAME_HERE@apex.local';


-- ============================================================
-- 4. VIEW ALL SEASONS AND THEIR STATUS
-- ============================================================

SELECT 
  id,
  season_number,
  is_active,
  created_at
FROM public.seasons
ORDER BY season_number DESC;


-- ============================================================
-- 5. MANUALLY SET ACTIVE SEASON
-- ============================================================

-- Deactivate all seasons first
UPDATE public.seasons SET is_active = false;

-- Activate specific season (replace SEASON_NUMBER)
UPDATE public.seasons 
SET is_active = true 
WHERE season_number = 28;


-- ============================================================
-- 6. VIEW ALL RP ENTRIES FOR A SEASON
-- ============================================================

SELECT 
  sre.entry_date,
  p.display_name,
  sre.delta_rp,
  sre.created_at
FROM public.season_rp_entries sre
JOIN public.profiles p ON sre.user_id = p.id
JOIN public.seasons s ON sre.season_id = s.id
WHERE s.season_number = 27  -- Change season number as needed
ORDER BY sre.entry_date DESC, p.display_name;


-- ============================================================
-- 7. VIEW SEASON TOTALS PER PLAYER
-- ============================================================

SELECT 
  p.display_name,
  SUM(sre.delta_rp) as total_rp,
  COUNT(*) as entries
FROM public.season_rp_entries sre
JOIN public.profiles p ON sre.user_id = p.id
JOIN public.seasons s ON sre.season_id = s.id
WHERE s.season_number = 27  -- Change season number as needed
GROUP BY p.display_name
ORDER BY total_rp DESC;


-- ============================================================
-- 8. MANUALLY ADD/UPDATE RP FOR A PLAYER
-- ============================================================

-- First, get the user_id and season_id
SELECT id, display_name FROM public.profiles;
SELECT id, season_number FROM public.seasons WHERE is_active = true;

-- Insert a new RP entry
INSERT INTO public.season_rp_entries (season_id, user_id, delta_rp, entry_date)
VALUES (
  'SEASON_UUID_HERE',
  'USER_UUID_HERE',
  100,  -- RP amount (can be negative)
  CURRENT_DATE
);

-- Or update an existing entry
UPDATE public.season_rp_entries
SET delta_rp = 150
WHERE id = 'ENTRY_UUID_HERE';


-- ============================================================
-- 9. DELETE A SPECIFIC RP ENTRY
-- ============================================================

-- View entries to find the one to delete
SELECT 
  sre.id,
  sre.entry_date,
  p.display_name,
  sre.delta_rp
FROM public.season_rp_entries sre
JOIN public.profiles p ON sre.user_id = p.id
ORDER BY sre.created_at DESC
LIMIT 20;

-- Delete by ID
DELETE FROM public.season_rp_entries WHERE id = 'ENTRY_UUID_HERE';


-- ============================================================
-- 10. VIEW ACTIVE SESSIONS
-- ============================================================

SELECT 
  s.id,
  s.season_number,
  p.display_name as host,
  s.doc,
  s.created_at,
  s.updated_at
FROM public.sessions s
LEFT JOIN public.profiles p ON s.host_user_id = p.id
ORDER BY s.updated_at DESC
LIMIT 10;


-- ============================================================
-- 11. DELETE OLD/STALE SESSIONS
-- ============================================================

-- Delete sessions older than 7 days
DELETE FROM public.sessions 
WHERE updated_at < NOW() - INTERVAL '7 days';


-- ============================================================
-- 12. ADD A USER TO A SEASON (if they're not auto-added)
-- ============================================================

-- Get IDs first
SELECT id, display_name FROM public.profiles;
SELECT id, season_number FROM public.seasons WHERE is_active = true;

-- Add user to season
INSERT INTO public.season_players (season_id, user_id)
VALUES ('SEASON_UUID_HERE', 'USER_UUID_HERE')
ON CONFLICT (season_id, user_id) DO NOTHING;


-- ============================================================
-- 13. VIEW ALL REGISTERED USERS
-- ============================================================

SELECT 
  p.id,
  p.username,
  p.display_name,
  p.created_at,
  (SELECT COUNT(*) FROM public.season_players sp WHERE sp.user_id = p.id) as seasons_joined
FROM public.profiles p
ORDER BY p.created_at DESC;


-- ============================================================
-- 14. DELETE A USER COMPLETELY
-- ============================================================
-- WARNING: This is destructive!

-- First delete from profiles (cascades to other tables)
DELETE FROM public.profiles WHERE username = 'USERNAME_HERE';

-- Then delete from auth.users (do this in Supabase Auth dashboard instead)
-- Or: DELETE FROM auth.users WHERE email = 'USERNAME_HERE@apex.local';


-- ============================================================
-- 15. QUICK STATS DASHBOARD
-- ============================================================

SELECT 
  (SELECT COUNT(*) FROM public.profiles) as total_users,
  (SELECT COUNT(*) FROM public.seasons) as total_seasons,
  (SELECT season_number FROM public.seasons WHERE is_active = true) as active_season,
  (SELECT COUNT(*) FROM public.sessions) as total_sessions,
  (SELECT COUNT(*) FROM public.season_rp_entries) as total_rp_entries;