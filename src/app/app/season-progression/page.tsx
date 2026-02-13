'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { getActiveSeason, type Season } from '@/lib/seasons';
import { fetchMyProfile, type Profile } from '@/lib/auth';

type SeasonPlayer = {
  user_id: string;
  display_name: string;
};

type RpEntry = {
  user_id: string;
  entry_date: string;
  delta_rp: number;
};

type PlayerStats = {
  user_id: string;
  display_name: string;
  totalKills: number;
  totalDamage: number;
  totalRP: number;
  donuts: number;
  oneKGames: number;
  twoKGames: number;
};

type ChartDataPoint = {
  date: string;
  [key: string]: string | number;
};

const PLAYER_COLORS = [
  '#E03A3E',
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
];

function formatDateLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${month}/${day}`;
}

function getDateRange(entries: RpEntry[]): string[] {
  if (entries.length === 0) return [];

  const dates = new Set(entries.map((e) => e.entry_date));
  const sortedDates = Array.from(dates).sort();

  if (sortedDates.length < 2) return sortedDates;

  const result: string[] = [];
  const start = new Date(sortedDates[0]);
  const end = new Date(sortedDates[sortedDates.length - 1]);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split('T')[0];
    result.push(iso);
  }

  return result;
}

function HighlightCard({
  title,
  value,
  playerName,
  icon,
  type = 'gold',
}: {
  title: string;
  value: string | number;
  playerName: string;
  icon: React.ReactNode;
  type?: 'gold' | 'shame';
}) {
  return (
    <div className={`highlight-card ${type}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="highlight-icon text-2xl">{icon}</div>
        <div className="text-xs text-tertiary uppercase tracking-wider text-right">{title}</div>
      </div>
      <div className="text-2xl font-bold text-primary mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-secondary">{playerName}</div>
    </div>
  );
}

export default function SeasonProgressionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<SeasonPlayer[]>([]);
  const [entries, setEntries] = useState<RpEntry[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<'all' | string[]>('all');

  const loadData = useCallback(async () => {
    try {
      setError(null);

      const [profileData, seasonData] = await Promise.all([
        fetchMyProfile(),
        getActiveSeason(),
      ]);

      setProfile(profileData);
      setSeason(seasonData);

      if (!seasonData) {
        setLoading(false);
        return;
      }

      // Get season players with profiles
      const { data: playerData, error: playerError } = await supabase
        .from('season_players')
        .select(`
          user_id,
          profiles (
            display_name
          )
        `)
        .eq('season_id', seasonData.id);

      if (playerError) throw playerError;

      const playersList: SeasonPlayer[] = (playerData ?? []).map((p: Record<string, unknown>) => ({
        user_id: p.user_id as string,
        display_name: (p.profiles as Record<string, string>)?.display_name ?? 'Unknown',
      }));

      setPlayers(playersList);

      // Get all RP entries for this season
      const { data: rpData, error: rpError } = await supabase
        .from('season_rp_entries')
        .select('user_id, entry_date, delta_rp')
        .eq('season_id', seasonData.id)
        .order('entry_date', { ascending: true });

      if (rpError) throw rpError;

      setEntries((rpData ?? []) as RpEntry[]);

      // Fetch game stats for all players
      const statsPromises = playersList.map(async (player) => {
        const { data: gameData, error: gameError } = await supabase
          .from('player_game_stats')
          .select(`
            damage,
            kills,
            game_stats!inner (
              live_sessions!inner (
                season_id
              )
            )
          `)
          .eq('user_id', player.user_id)
          .eq('game_stats.live_sessions.season_id', seasonData.id);

        if (gameError) {
          console.error('Error fetching stats for', player.display_name, gameError);
          return null;
        }

        const stats = gameData ?? [];
        const totalKills = stats.reduce((sum, g) => sum + g.kills, 0);
        const totalDamage = stats.reduce((sum, g) => sum + g.damage, 0);
        const donuts = stats.filter(g => g.kills === 0).length;
        const oneKGames = stats.filter(g => g.damage >= 1000).length;
        const twoKGames = stats.filter(g => g.damage >= 2000).length;

        const playerRpEntries = (rpData ?? []).filter(e => e.user_id === player.user_id);
        const totalRP = playerRpEntries.reduce((sum, e) => sum + e.delta_rp, 0);

        return {
          user_id: player.user_id,
          display_name: player.display_name,
          totalKills,
          totalDamage,
          totalRP,
          donuts,
          oneKGames,
          twoKGames,
        };
      });

      const allStats = await Promise.all(statsPromises);
      setPlayerStats(allStats.filter((s): s is PlayerStats => s !== null));

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chartData = useMemo((): ChartDataPoint[] => {
    if (players.length === 0 || entries.length === 0) return [];

    const dates = getDateRange(entries);
    if (dates.length === 0) return [];

    const entriesByDateUser: Record<string, Record<string, number>> = {};
    for (const entry of entries) {
      if (!entriesByDateUser[entry.entry_date]) {
        entriesByDateUser[entry.entry_date] = {};
      }
      const current = entriesByDateUser[entry.entry_date][entry.user_id] ?? 0;
      entriesByDateUser[entry.entry_date][entry.user_id] = current + entry.delta_rp;
    }

    const cumulative: Record<string, number> = {};
    players.forEach((p) => (cumulative[p.user_id] = 0));

    return dates.map((date) => {
      const point: ChartDataPoint = { date: formatDateLabel(date) };

      for (const player of players) {
        const dayDelta = entriesByDateUser[date]?.[player.user_id] ?? 0;
        cumulative[player.user_id] += dayDelta;
        point[player.display_name] = cumulative[player.user_id];
      }

      return point;
    });
  }, [entries, players]);

  const visiblePlayers = useMemo(() => {
    if (selectedPlayers === 'all') return players;
    return players.filter((p) => selectedPlayers.includes(p.user_id));
  }, [players, selectedPlayers]);

  const highlights = useMemo(() => {
    if (playerStats.length === 0) return null;

    const mostKills = playerStats.reduce((max, p) => p.totalKills > max.totalKills ? p : max, playerStats[0]);
    const mostDamage = playerStats.reduce((max, p) => p.totalDamage > max.totalDamage ? p : max, playerStats[0]);
    const mostRP = playerStats.reduce((max, p) => p.totalRP > max.totalRP ? p : max, playerStats[0]);
    const mostDonuts = playerStats.reduce((max, p) => p.donuts > max.donuts ? p : max, playerStats[0]);
    const most1K = playerStats.reduce((max, p) => p.oneKGames > max.oneKGames ? p : max, playerStats[0]);
    const most2K = playerStats.reduce((max, p) => p.twoKGames > max.twoKGames ? p : max, playerStats[0]);

    return { mostKills, mostDamage, mostRP, mostDonuts, most1K, most2K };
  }, [playerStats]);

  function handleAllChange(checked: boolean) {
    setSelectedPlayers(checked ? 'all' : []);
  }

  function handlePlayerChange(userId: string, checked: boolean) {
    if (selectedPlayers === 'all') {
      setSelectedPlayers(checked ? [userId] : players.filter((p) => p.user_id !== userId).map((p) => p.user_id));
    } else {
      setSelectedPlayers(checked 
        ? [...selectedPlayers, userId]
        : selectedPlayers.filter((id) => id !== userId)
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-secondary">Loading...</p>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center px-4">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-bold text-primary mb-2">Not Signed In</h2>
          <p className="text-secondary text-sm mb-6">Please sign in to view the leaderboard.</p>
          <button onClick={() => router.push('/app')} className="btn-secondary">
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  if (!season) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center px-4">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-bold text-primary mb-2">No Active Season</h2>
          <p className="text-secondary text-sm mb-6">A season must be active to view the leaderboard.</p>
          <button onClick={() => router.push('/app')} className="btn-secondary">
            Go to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-primary py-8">
      <div className="page-container page-transition">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-primary mb-2">
            Season {season.season_number} <span className="text-accent">Leaderboard</span>
          </h1>
          <p className="text-secondary">
            Track your squad&apos;s RP journey and see who&apos;s leading.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {/* Season Awards */}
        {highlights && (
          <div className="mb-8">
            <div className="section-header mb-4">
              <div className="indicator" />
              <div className="title">Season Awards</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <HighlightCard
                title="Most Kills"
                value={highlights.mostKills.totalKills}
                playerName={highlights.mostKills.display_name}
                icon="🎯"
                type="gold"
              />
              <HighlightCard
                title="Most Damage"
                value={highlights.mostDamage.totalDamage}
                playerName={highlights.mostDamage.display_name}
                icon="💥"
                type="gold"
              />
              <HighlightCard
                title="Most RP"
                value={highlights.mostRP.totalRP > 0 ? `+${highlights.mostRP.totalRP}` : highlights.mostRP.totalRP}
                playerName={highlights.mostRP.display_name}
                icon="📈"
                type="gold"
              />
              <HighlightCard
                title="Most 1K Games"
                value={highlights.most1K.oneKGames}
                playerName={highlights.most1K.display_name}
                icon="🔥"
                type="gold"
              />
              <HighlightCard
                title="Most 2K Games"
                value={highlights.most2K.twoKGames}
                playerName={highlights.most2K.display_name}
                icon="⚡"
                type="gold"
              />
              <HighlightCard
                title="Most Donuts"
                value={highlights.mostDonuts.donuts}
                playerName={highlights.mostDonuts.display_name}
                icon="🍩"
                type="shame"
              />
            </div>
          </div>
        )}

        {/* Player Filters */}
        {players.length > 0 && (
          <div className="card p-4 mb-6">
            <div className="section-header mb-3">
              <div className="indicator" />
              <div className="title">Filter Players</div>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedPlayers === 'all'}
                  onChange={(e) => handleAllChange(e.target.checked)}
                  className="w-4 h-4 rounded border-2 accent-accent cursor-pointer"
                />
                <span className="text-sm text-primary font-medium">All</span>
              </label>

              {players.map((player, idx) => (
                <label key={player.user_id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPlayers === 'all' || selectedPlayers.includes(player.user_id)}
                    disabled={selectedPlayers === 'all'}
                    onChange={(e) => handlePlayerChange(player.user_id, e.target.checked)}
                    className="w-4 h-4 rounded border-2 accent-accent disabled:opacity-50 cursor-pointer"
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: PLAYER_COLORS[idx % PLAYER_COLORS.length] }}
                  >
                    {player.display_name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* RP Progression Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="section-header mb-0">
              <div className="indicator" />
              <div className="title">RP Progression</div>
            </div>
            <div className="text-sm text-secondary">Cumulative RP gains</div>
          </div>

          {chartData.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-secondary mb-2">No RP data yet</h3>
              <p className="text-sm text-tertiary">
                RP will appear here after sessions are posted.
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', height: 400 }}>
              <ResponsiveContainer>
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                    axisLine={{ stroke: 'var(--border-primary)' }}
                    tickLine={{ stroke: 'var(--border-primary)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                    tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
                    axisLine={{ stroke: 'var(--border-primary)' }}
                    tickLine={{ stroke: 'var(--border-primary)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                    }}
                    labelStyle={{ color: 'var(--text-secondary)' }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />

                  {visiblePlayers.map((player) => {
                    const playerIndex = players.findIndex((p) => p.user_id === player.user_id);
                    return (
                      <Line
                        key={player.user_id}
                        type="monotone"
                        dataKey={player.display_name}
                        stroke={PLAYER_COLORS[playerIndex % PLAYER_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
