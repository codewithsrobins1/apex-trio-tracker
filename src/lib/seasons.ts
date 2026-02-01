import { supabase } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth';

export type Season = {
  id: string;
  season_number: number;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
};

/**
 * Get the current active season (or null if none)
 */
export async function getActiveSeason(): Promise<Season | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data as Season | null;
}

/**
 * Set a new active season (deactivates any existing one)
 */
export async function setActiveSeason(seasonNumber: number): Promise<Season> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Must be logged in to set season');

  // 1. Deactivate all existing seasons
  const { error: deactivateError } = await supabase
    .from('seasons')
    .update({ is_active: false })
    .eq('is_active', true);

  if (deactivateError) throw deactivateError;

  // 2. Check if this season already exists
  const { data: existing } = await supabase
    .from('seasons')
    .select('*')
    .eq('season_number', seasonNumber)
    .maybeSingle();

  if (existing) {
    // Reactivate existing season
    const { data, error } = await supabase
      .from('seasons')
      .update({ is_active: true })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as Season;
  }

  // 3. Create new season
  const { data, error } = await supabase
    .from('seasons')
    .insert({
      season_number: seasonNumber,
      is_active: true,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Season;
}

/**
 * Reset the current season - wipes all RP entries for this season
 */
export async function resetCurrentSeason(): Promise<void> {
  const season = await getActiveSeason();
  if (!season) throw new Error('No active season to reset');

  // Delete all RP entries for this season
  const { error } = await supabase
    .from('season_rp_entries')
    .delete()
    .eq('season_id', season.id);

  if (error) throw error;
}

/**
 * Deactivate the current season (so a new one can be set)
 */
export async function deactivateSeason(): Promise<void> {
  const { error } = await supabase
    .from('seasons')
    .update({ is_active: false })
    .eq('is_active', true);

  if (error) throw error;
}

/**
 * Add current user to the active season's player list
 */
export async function joinActiveSeason(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Must be logged in');

  const season = await getActiveSeason();
  if (!season) throw new Error('No active season');

  // Use upsert to avoid duplicate errors
  const { error } = await supabase.from('season_players').upsert(
    {
      season_id: season.id,
      user_id: userId,
    },
    { onConflict: 'season_id,user_id' }
  );

  if (error) throw error;
}

/**
 * Get all players in the active season with their profiles
 */
export async function getSeasonPlayers(): Promise<
  { user_id: string; display_name: string; username: string }[]
> {
  const season = await getActiveSeason();
  if (!season) return [];

  const { data, error } = await supabase
    .from('season_players')
    .select(
      `
      user_id,
      profiles (
        display_name,
        username
      )
    `
    )
    .eq('season_id', season.id);

  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    user_id: row.user_id as string,
    display_name: (row.profiles as Record<string, string>)?.display_name ?? 'Unknown',
    username: (row.profiles as Record<string, string>)?.username ?? 'unknown',
  }));
}
