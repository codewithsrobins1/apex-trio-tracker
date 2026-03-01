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

// ── Types ──────────────────────────────────────────────────────────────────────

type SeasonPlayer = {
  user_id: string;
  display_name: string;
};

type RawSession = {
  date: string;
  rp: number;
  kills: number;
  damage: number;
  donuts: number;
  oneK: number;
  twoK: number;
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
  rpHistory: { date: string; rp: number }[];
  sessions: RawSession[];
};

type BestSession = {
  date: string;
  totalRP: number;
  players: { name: string; rp: number }[];
};

type ChartDataPoint = {
  date: string;
  [key: string]: string | number;
};

type ViewMode = 'season' | 'weekly';

// ── Constants ──────────────────────────────────────────────────────────────────

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

// ── Date helpers ───────────────────────────────────────────────────────────────

function formatDateLabel(isoDate: string): string {
  const [, month, day] = isoDate.split('-');
  return `${month}/${day}`;
}

function formatFullDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Returns the Monday of the week containing dateStr (ISO format) */
function getWeekStart(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const day = date.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday.toISOString().split('T')[0];
}

/** Returns the Sunday of the week (6 days after Monday) */
function getWeekEnd(weekStart: string): string {
  const date = new Date(weekStart + 'T12:00:00');
  date.setDate(date.getDate() + 6);
  return date.toISOString().split('T')[0];
}

function formatWeekLabel(weekStart: string): string {
  const end = getWeekEnd(weekStart);
  const s = new Date(weekStart + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(s)} – ${fmt(e)}`;
}

function getDateRangeFromStats(playerStats: PlayerStats[]): string[] {
  const allDates = new Set<string>();
  playerStats.forEach((p) => p.rpHistory.forEach((e) => allDates.add(e.date)));
  const sorted = Array.from(allDates).sort();
  if (sorted.length < 2) return sorted;

  const result: string[] = [];
  const start = new Date(sorted[0] + 'T12:00:00');
  const end = new Date(sorted[sorted.length - 1] + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    result.push(d.toISOString().split('T')[0]);
  }
  return result;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function HighlightCard({
  title,
  players,
  icon,
  type = 'gold',
}: {
  title: string;
  players: { name: string; value: number | string }[];
  icon: React.ReactNode;
  type?: 'gold' | 'shame';
}) {
  const [first, ...rest] = players;
  return (
    <div className={`highlight-card ${type}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="highlight-icon text-2xl">{icon}</div>
        <div className="text-xs text-tertiary uppercase tracking-wider text-right">{title}</div>
      </div>
      {first && (
        <>
          <div className="text-[11px] text-tertiary uppercase tracking-wide mb-1">#1</div>
          <div className="text-2xl font-bold text-primary leading-tight">
            {typeof first.value === 'number' ? first.value.toLocaleString() : first.value}
          </div>
          <div className="text-sm text-secondary mb-2">{first.name}</div>
        </>
      )}
      {rest.length > 0 && (
        <div className="mt-1 space-y-1 text-xs text-tertiary">
          {rest.map((p, idx) => (
            <div key={p.name} className="flex items-center justify-between gap-2">
              <span className="uppercase tracking-wide">#{idx + 2}</span>
              <span className="truncate">{p.name}</span>
              <span className="tabular-nums">
                {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-themed">
      {(['season', 'weekly'] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer capitalize ${
            mode === m
              ? 'bg-accent text-white shadow-md shadow-accent/30'
              : 'text-secondary hover:text-primary'
          }`}
        >
          {m === 'season' ? '📅 Season' : '📆 Weekly'}
        </button>
      ))}
    </div>
  );
}

function WeekNavigator({
  weeks,
  selectedWeek,
  onChange,
}: {
  weeks: string[];
  selectedWeek: string;
  onChange: (w: string) => void;
}) {
  const idx = weeks.indexOf(selectedWeek);
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => idx > 0 && onChange(weeks[idx - 1])}
        disabled={idx <= 0}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-themed text-secondary hover:text-primary hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
      >
        ‹
      </button>
      <span className="text-sm font-medium text-primary min-w-[160px] text-center">
        {formatWeekLabel(selectedWeek)}
      </span>
      <button
        onClick={() => idx < weeks.length - 1 && onChange(weeks[idx + 1])}
        disabled={idx >= weeks.length - 1}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-themed text-secondary hover:text-primary hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
      >
        ›
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SeasonProgressionPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [players, setPlayers] = useState<SeasonPlayer[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [bestSession, setBestSession] = useState<BestSession | null>(null);
  const [worstSession, setWorstSession] = useState<BestSession | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<'all' | string[]>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('season');
  const [selectedWeek, setSelectedWeek] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [profileData, seasonData] = await Promise.all([fetchMyProfile(), getActiveSeason()]);
      setProfile(profileData);
      setSeason(seasonData);
      if (!seasonData) { setLoading(false); return; }

      // Players
      const { data: playerData, error: playerError } = await supabase
        .from('season_players')
        .select('user_id, profiles (display_name)')
        .eq('season_id', seasonData.id);
      if (playerError) throw playerError;

      const playersList: SeasonPlayer[] = (playerData ?? []).map((p: Record<string, unknown>) => ({
        user_id: p.user_id as string,
        display_name: (p.profiles as Record<string, string>)?.display_name ?? 'Unknown',
      }));
      setPlayers(playersList);

      // Stats per player
      const statsPromises = playersList.map(async (player) => {
        const { data: statsData, error: statsError } = await supabase
          .from('season_player_stats')
          .select('games, total_damage, total_kills, one_k_games, two_k_games, donuts, total_rp, created_at')
          .eq('season_id', seasonData.id)
          .eq('user_id', player.user_id)
          .order('created_at', { ascending: true });

        if (statsError) { console.error('Stats error for', player.display_name, statsError); return null; }

        const stats = statsData ?? [];
        return {
          user_id: player.user_id,
          display_name: player.display_name,
          totalKills:  stats.reduce((s, r) => s + r.total_kills, 0),
          totalDamage: stats.reduce((s, r) => s + r.total_damage, 0),
          totalRP:     stats.reduce((s, r) => s + (r.total_rp || 0), 0),
          donuts:      stats.reduce((s, r) => s + r.donuts, 0),
          oneKGames:   stats.reduce((s, r) => s + r.one_k_games, 0),
          twoKGames:   stats.reduce((s, r) => s + r.two_k_games, 0),
          rpHistory: stats.map((s) => ({ date: s.created_at.split('T')[0], rp: s.total_rp || 0 })),
          sessions: stats.map((s) => ({
            date:   s.created_at.split('T')[0],
            rp:     s.total_rp || 0,
            kills:  s.total_kills,
            damage: s.total_damage,
            donuts: s.donuts,
            oneK:   s.one_k_games,
            twoK:   s.two_k_games,
          })),
        } as PlayerStats;
      });

      const allStats = (await Promise.all(statsPromises)).filter((s): s is PlayerStats => s !== null);
      setPlayerStats(allStats);

      // Best / worst squad sessions
      const { data: bestSessionData, error: bestSessionError } = await supabase
        .from('season_player_stats')
        .select('created_at, total_rp, session_id, profiles!inner (display_name)')
        .eq('season_id', seasonData.id);

      if (!bestSessionError && bestSessionData) {
        const sessionMap: Record<string, { date: string; players: { name: string; rp: number }[] }> = {};
        for (const row of bestSessionData) {
          const groupKey = row.session_id || row.created_at.slice(0, 16);
          if (!sessionMap[groupKey]) sessionMap[groupKey] = { date: row.created_at.split('T')[0], players: [] };
          sessionMap[groupKey].players.push({
            name: (row.profiles as { display_name: string }).display_name,
            rp: row.total_rp || 0,
          });
        }

        let best: BestSession | null = null;
        let worst: BestSession | null = null;
        let bestTotal = -Infinity;
        let worstTotal = Infinity;

        for (const session of Object.values(sessionMap)) {
          const total = session.players.reduce((s, p) => s + p.rp, 0);
          if (total > bestTotal) { bestTotal = total; best = { date: session.date, totalRP: total, players: [...session.players].sort((a, b) => b.rp - a.rp) }; }
          if (total < worstTotal) { worstTotal = total; worst = { date: session.date, totalRP: total, players: [...session.players].sort((a, b) => a.rp - b.rp) }; }
        }
        setBestSession(best);
        setWorstSession(worst);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Available weeks ──────────────────────────────────────────────────────────

  const availableWeeks = useMemo((): string[] => {
    const weekSet = new Set<string>();
    playerStats.forEach((p) => p.sessions.forEach((s) => weekSet.add(getWeekStart(s.date))));
    return Array.from(weekSet).sort();
  }, [playerStats]);

  // Default to the most recent week when data loads
  useEffect(() => {
    if (availableWeeks.length > 0 && !selectedWeek) {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1]);
    }
  }, [availableWeeks, selectedWeek]);

  // ── Season chart data ────────────────────────────────────────────────────────

  const seasonChartData = useMemo((): ChartDataPoint[] => {
    if (!players.length || !playerStats.length) return [];
    const dates = getDateRangeFromStats(playerStats);
    if (!dates.length) return [];

    const cumulativeByPlayer: Record<string, Record<string, number>> = {};
    for (const player of playerStats) {
      cumulativeByPlayer[player.user_id] = {};
      let cumulative = 0;
      for (const entry of [...player.rpHistory].sort((a, b) => a.date.localeCompare(b.date))) {
        cumulative += entry.rp;
        cumulativeByPlayer[player.user_id][entry.date] = cumulative;
      }
    }

    const cumulative: Record<string, number> = {};
    players.forEach((p) => (cumulative[p.user_id] = 0));

    return dates.map((date) => {
      const point: ChartDataPoint = { date: formatDateLabel(date) };
      for (const player of players) {
        if (cumulativeByPlayer[player.user_id]?.[date] !== undefined) {
          cumulative[player.user_id] = cumulativeByPlayer[player.user_id][date];
        }
        point[player.display_name] = cumulative[player.user_id];
      }
      return point;
    });
  }, [playerStats, players]);

  // ── Weekly chart data ────────────────────────────────────────────────────────

  const weeklyChartData = useMemo((): ChartDataPoint[] => {
    if (!selectedWeek || !players.length || !playerStats.length) return [];

    const weekEnd = getWeekEnd(selectedWeek);
    // Build all 7 days of the week
    const days: string[] = [];
    for (let d = new Date(selectedWeek + 'T12:00:00'); d <= new Date(weekEnd + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().split('T')[0]);
    }

    return days.map((date) => {
      const point: ChartDataPoint = { date: formatDateLabel(date) };
      for (const player of players) {
        const ps = playerStats.find((s) => s.user_id === player.user_id);
        const sessions = ps?.sessions.filter((s) => s.date === date) ?? [];
        point[player.display_name] = sessions.reduce((sum, s) => sum + s.rp, 0);
      }
      return point;
    });
  }, [selectedWeek, playerStats, players]);

  const chartData = viewMode === 'season' ? seasonChartData : weeklyChartData;

  // ── Weekly stats for awards ──────────────────────────────────────────────────

  const weeklyPlayerStats = useMemo((): PlayerStats[] => {
    if (!selectedWeek) return [];
    const weekEnd = getWeekEnd(selectedWeek);
    return playerStats.map((p) => {
      const weekSessions = p.sessions.filter((s) => s.date >= selectedWeek && s.date <= weekEnd);
      return {
        ...p,
        totalKills:  weekSessions.reduce((s, r) => s + r.kills, 0),
        totalDamage: weekSessions.reduce((s, r) => s + r.damage, 0),
        totalRP:     weekSessions.reduce((s, r) => s + r.rp, 0),
        donuts:      weekSessions.reduce((s, r) => s + r.donuts, 0),
        oneKGames:   weekSessions.reduce((s, r) => s + r.oneK, 0),
        twoKGames:   weekSessions.reduce((s, r) => s + r.twoK, 0),
      };
    });
  }, [playerStats, selectedWeek]);

  const activeStats = viewMode === 'season' ? playerStats : weeklyPlayerStats;

  // ── Highlights (awards) ──────────────────────────────────────────────────────

  const highlights = useMemo(() => {
    if (!activeStats.length) return null;
    const sortBy = (key: keyof PlayerStats) =>
      [...activeStats].sort((a, b) => (b[key] as number) - (a[key] as number));

    return {
      top3Kills:   sortBy('totalKills').slice(0, 3).map((p) => ({ name: p.display_name, value: p.totalKills })),
      top3Damage:  sortBy('totalDamage').slice(0, 3).map((p) => ({ name: p.display_name, value: p.totalDamage })),
      top3RP:      sortBy('totalRP').slice(0, 3).map((p) => ({ name: p.display_name, value: p.totalRP > 0 ? `+${p.totalRP}` : p.totalRP })),
      top31K:      sortBy('oneKGames').slice(0, 3).map((p) => ({ name: p.display_name, value: p.oneKGames })),
      top32K:      sortBy('twoKGames').slice(0, 3).map((p) => ({ name: p.display_name, value: p.twoKGames })),
      top3Donuts:  sortBy('donuts').slice(0, 3).map((p) => ({ name: p.display_name, value: p.donuts })),
    };
  }, [activeStats]);

  // ── Visible players for chart ────────────────────────────────────────────────

  const visiblePlayers = useMemo(() => {
    if (selectedPlayers === 'all') return players;
    return players.filter((p) => selectedPlayers.includes(p.user_id));
  }, [players, selectedPlayers]);

  // ── Player filter handlers ───────────────────────────────────────────────────

  function handleAllChange(checked: boolean) { setSelectedPlayers(checked ? 'all' : []); }
  function handlePlayerChange(userId: string, checked: boolean) {
    if (selectedPlayers === 'all') {
      setSelectedPlayers(checked ? [userId] : players.filter((p) => p.user_id !== userId).map((p) => p.user_id));
    } else {
      setSelectedPlayers(checked ? [...selectedPlayers, userId] : selectedPlayers.filter((id) => id !== userId));
    }
  }

  // ── Loading / auth guards ────────────────────────────────────────────────────

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
          <button onClick={() => router.push('/app')} className="btn-secondary">Go to Dashboard</button>
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
          <button onClick={() => router.push('/app')} className="btn-secondary">Go to Dashboard</button>
        </div>
      </main>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-primary py-8">
      <div className="page-container page-transition">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary mb-1">
              Season {season.season_number} <span className="text-accent">Leaderboard</span>
            </h1>
            <p className="text-secondary text-sm">Track your squad&apos;s RP journey and see who&apos;s leading.</p>
          </div>
          <ViewToggle mode={viewMode} onChange={(m) => setViewMode(m)} />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
        )}

        {/* Best / Worst Squad Session — season view only */}
        {viewMode === 'season' && (bestSession || (worstSession && worstSession.totalRP < 0)) && (
          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {bestSession && bestSession.totalRP > 0 && (
              <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🏆</span>
                    <div className="text-xs font-semibold uppercase tracking-wider text-amber-500">Best Squad Session</div>
                  </div>
                  <div className="text-sm text-secondary">{formatFullDate(bestSession.date)}</div>
                </div>
                <div className="text-center mb-6">
                  <div className="text-5xl sm:text-6xl font-extrabold text-accent">+{bestSession.totalRP.toLocaleString()}</div>
                  <div className="text-sm text-secondary mt-1">Total Squad RP</div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {bestSession.players.map((player) => (
                    <div key={player.name} className="bg-card rounded-xl p-4 text-center border border-themed">
                      <div className="text-sm font-semibold text-primary mb-1 truncate">{player.name}</div>
                      <div className={`text-xl font-bold ${player.rp >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {player.rp >= 0 ? '+' : ''}{player.rp}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {worstSession && worstSession.totalRP < 0 && (
              <div className="rounded-2xl border-2 border-red-500/30 bg-gradient-to-r from-red-500/10 via-red-500/5 to-transparent p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">💀</span>
                    <div className="text-xs font-semibold uppercase tracking-wider text-red-500">Worst Squad Session</div>
                  </div>
                  <div className="text-sm text-secondary">{formatFullDate(worstSession.date)}</div>
                </div>
                <div className="text-center mb-6">
                  <div className="text-5xl sm:text-6xl font-extrabold text-red-500">{worstSession.totalRP.toLocaleString()}</div>
                  <div className="text-sm text-secondary mt-1">Total Squad RP</div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {worstSession.players.map((player) => (
                    <div key={player.name} className="bg-card rounded-xl p-4 text-center border border-themed">
                      <div className="text-sm font-semibold text-primary mb-1 truncate">{player.name}</div>
                      <div className={`text-xl font-bold ${player.rp >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {player.rp >= 0 ? '+' : ''}{player.rp}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Awards */}
        {highlights && (
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="section-header mb-0">
                <div className="indicator" />
                <div className="title">
                  {viewMode === 'season' ? 'Season Awards' : 'Weekly Awards'}
                </div>
              </div>
              {viewMode === 'weekly' && availableWeeks.length > 0 && selectedWeek && (
                <WeekNavigator weeks={availableWeeks} selectedWeek={selectedWeek} onChange={setSelectedWeek} />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <HighlightCard title="Most Kills"    players={highlights.top3Kills}   icon="🎯" type="gold" />
              <HighlightCard title="Most Damage"   players={highlights.top3Damage}  icon="💥" type="gold" />
              <HighlightCard title="Most RP"       players={highlights.top3RP}      icon="📈" type="gold" />
              <HighlightCard title="Most 1K Games" players={highlights.top31K}      icon="🔥" type="gold" />
              <HighlightCard title="Most 2K Games" players={highlights.top32K}      icon="⚡" type="gold" />
              <HighlightCard title="Most Donuts"   players={highlights.top3Donuts}  icon="🍩" type="shame" />
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
                  <span className="text-sm font-medium" style={{ color: PLAYER_COLORS[idx % PLAYER_COLORS.length] }}>
                    {player.display_name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="card p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="section-header mb-0">
              <div className="indicator" />
              <div className="title">RP Progression</div>
            </div>
            <div className="flex items-center gap-4">
              {viewMode === 'weekly' && availableWeeks.length > 0 && selectedWeek && (
                <WeekNavigator weeks={availableWeeks} selectedWeek={selectedWeek} onChange={setSelectedWeek} />
              )}
              <div className="text-sm text-secondary">
                {viewMode === 'season' ? 'Cumulative RP gains' : 'Daily RP this week'}
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-secondary mb-2">
                {viewMode === 'weekly' ? 'No RP data for this week' : 'No RP data yet'}
              </h3>
              <p className="text-sm text-tertiary">RP will appear here after sessions are posted.</p>
            </div>
          ) : (
            <div style={{ width: '100%', height: 400 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
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
