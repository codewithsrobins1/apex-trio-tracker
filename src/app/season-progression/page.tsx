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

type ChartDataPoint = {
  date: string;
  [key: string]: string | number;
};

// Player colors for the graph lines
const PLAYER_COLORS = [
  '#E03A3E', // Red (primary)
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year.slice(2)}`;
}

function getDateRange(entries: RpEntry[]): string[] {
  if (entries.length === 0) return [];

  const dates = new Set(entries.map((e) => e.entry_date));
  const sortedDates = Array.from(dates).sort();

  // Fill in gaps between dates
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

export default function SeasonProgressionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<SeasonPlayer[]>([]);
  const [entries, setEntries] = useState<RpEntry[]>([]);

  // Checkbox state: 'all' or array of user_ids
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

  // Build chart data with cumulative RP
  const chartData = useMemo((): ChartDataPoint[] => {
    if (players.length === 0 || entries.length === 0) return [];

    const dates = getDateRange(entries);
    if (dates.length === 0) return [];

    // Group entries by date and user
    const entriesByDateUser: Record<string, Record<string, number>> = {};
    for (const entry of entries) {
      if (!entriesByDateUser[entry.entry_date]) {
        entriesByDateUser[entry.entry_date] = {};
      }
      const current = entriesByDateUser[entry.entry_date][entry.user_id] ?? 0;
      entriesByDateUser[entry.entry_date][entry.user_id] = current + entry.delta_rp;
    }

    // Build cumulative data
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

  // Get visible players based on selection
  const visiblePlayers = useMemo(() => {
    if (selectedPlayers === 'all') return players;
    return players.filter((p) => selectedPlayers.includes(p.user_id));
  }, [players, selectedPlayers]);

  // Handle checkbox changes
  function handleAllChange(checked: boolean) {
    if (checked) {
      setSelectedPlayers('all');
    } else {
      setSelectedPlayers([]);
    }
  }

  function handlePlayerChange(userId: string, checked: boolean) {
    if (selectedPlayers === 'all') {
      // Switching from 'all' to individual selection
      if (checked) {
        setSelectedPlayers([userId]);
      } else {
        setSelectedPlayers(players.filter((p) => p.user_id !== userId).map((p) => p.user_id));
      }
    } else {
      if (checked) {
        setSelectedPlayers([...selectedPlayers, userId]);
      } else {
        setSelectedPlayers(selectedPlayers.filter((id) => id !== userId));
      }
    }
  }

  // Styles
  const btnGhost =
    'cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-3 text-sm font-semibold text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition';

  if (loading) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-sm text-slate-400">Loading…</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Not signed in</div>
          <p className="text-sm text-slate-400 mb-4">
            Please sign in to view season progression.
          </p>
          <button onClick={() => router.push('/')} className={btnGhost}>
            Go Home
          </button>
        </div>
      </main>
    );
  }

  if (!season) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">No active season</div>
          <p className="text-sm text-slate-400 mb-4">
            Set a season on the home page to start tracking.
          </p>
          <button onClick={() => router.push('/')} className={btnGhost}>
            Go Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="uppercase tracking-[0.35em] text-[10px] text-slate-500 mb-2">
              Apex Legends
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#E03A3E]">
              Season {season.season_number} Progression
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Cumulative RP gains throughout the season
            </p>
          </div>
          <button onClick={() => router.push('/')} className={btnGhost}>
            Home
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Player Filters */}
        <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-3">
            Filter Players
          </div>
          <div className="flex flex-wrap gap-4">
            {/* All checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPlayers === 'all'}
                onChange={(e) => handleAllChange(e.target.checked)}
                className="w-4 h-4 rounded border-[#2A2E32] bg-[#0E1115] text-[#E03A3E] focus:ring-[#E03A3E] focus:ring-offset-0"
              />
              <span className="text-sm text-slate-200 font-medium">All</span>
            </label>

            {/* Individual player checkboxes */}
            {players.map((player, idx) => (
              <label key={player.user_id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    selectedPlayers === 'all' || selectedPlayers.includes(player.user_id)
                  }
                  disabled={selectedPlayers === 'all'}
                  onChange={(e) => handlePlayerChange(player.user_id, e.target.checked)}
                  className="w-4 h-4 rounded border-[#2A2E32] bg-[#0E1115] text-[#E03A3E] focus:ring-[#E03A3E] focus:ring-offset-0 disabled:opacity-50"
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

        {/* Chart */}
        <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-6">
          {chartData.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-lg font-semibold text-slate-300 mb-2">
                No RP data yet
              </div>
              <p className="text-sm text-slate-500">
                RP will appear here after sessions are posted from the In-Game Tracker.
              </p>
            </div>
          ) : (
            <div style={{ width: '100%', height: 500 }}>
              <ResponsiveContainer>
                <LineChart
                  data={chartData}
                  margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2A2E32" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                  />
                  <YAxis
                    domain={[-5000, 5000]}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v) => (v > 0 ? `+${v}` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121418',
                      border: '1px solid #2A2E32',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#4B5563" strokeDasharray="3 3" />

                  {visiblePlayers.map((player, idx) => {
                    const playerIndex = players.findIndex(
                      (p) => p.user_id === player.user_id
                    );
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

        {/* Stats Summary */}
        {players.length > 0 && chartData.length > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {players.map((player, idx) => {
              const lastPoint = chartData[chartData.length - 1];
              const totalRp = (lastPoint?.[player.display_name] as number) ?? 0;
              return (
                <div
                  key={player.user_id}
                  className="rounded-xl border border-[#2A2E32] bg-[#121418] p-4"
                >
                  <div
                    className="text-sm font-medium mb-1"
                    style={{ color: PLAYER_COLORS[idx % PLAYER_COLORS.length] }}
                  >
                    {player.display_name}
                  </div>
                  <div className="text-2xl font-bold text-slate-100">
                    {totalRp > 0 ? '+' : ''}
                    {totalRp}
                  </div>
                  <div className="text-xs text-slate-500">Total RP</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
