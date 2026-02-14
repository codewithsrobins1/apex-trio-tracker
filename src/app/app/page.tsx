'use client';

import { useEffect, useState, useCallback } from 'react';
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
} from 'recharts';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, type Profile } from '@/lib/auth';
import { getActiveSeason, type Season } from '@/lib/seasons';
import { useToast } from '@/components/ToastProvider';

type PlayerStats = {
  totalKills: number;
  totalDamage: number;
  totalRP: number;
  donuts: number;
  oneKGames: number;
  twoKGames: number;
  totalGames: number;
  avgDamage: number;
  avgKills: number;
};

type ChartDataPoint = {
  date: string;
  rp: number;
  kills: number;
  damage: number;
  donuts: number;
  oneK: number;
  twoK: number;
};

const METRIC_CONFIG = {
  rp: { label: 'RP', color: '#E03A3E' },
  kills: { label: 'Kills', color: '#3B82F6' },
  damage: { label: 'Damage', color: '#10B981' },
  donuts: { label: 'Donuts', color: '#8B5CF6' },
  oneK: { label: '1K Games', color: '#F59E0B' },
  twoK: { label: '2K Games', color: '#EC4899' },
};

export default function DashboardPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  
  const [activeTab, setActiveTab] = useState<'stats' | 'session'>('stats');
  const [sessionView, setSessionView] = useState<'choice' | 'join'>('choice');
  const [joinCode, setJoinCode] = useState('');
  const [joiningSession, setJoiningSession] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [visibleMetrics, setVisibleMetrics] = useState<string[]>(['rp']);

  const loadData = useCallback(async () => {
    try {
      const [profileData, seasonData] = await Promise.all([
        fetchMyProfile(),
        getActiveSeason(),
      ]);

      setProfile(profileData);
      setSeason(seasonData);

      if (profileData && seasonData) {
        // Fetch player stats for this season
        await loadPlayerStats(profileData.id, seasonData.id);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlayerStats = async (userId: string, seasonId: string) => {
    try {
      // Get all session stats for this user in this season (including RP)
      const { data: statsData, error: statsError } = await supabase
        .from('season_player_stats')
        .select('games, total_damage, total_kills, one_k_games, two_k_games, donuts, total_rp, created_at')
        .eq('user_id', userId)
        .eq('season_id', seasonId)
        .order('created_at', { ascending: true });

      if (statsError) throw statsError;

      const sessions = statsData ?? [];
      
      // Aggregate stats across all sessions
      const totalKills = sessions.reduce((sum, s) => sum + s.total_kills, 0);
      const totalDamage = sessions.reduce((sum, s) => sum + s.total_damage, 0);
      const donuts = sessions.reduce((sum, s) => sum + s.donuts, 0);
      const oneKGames = sessions.reduce((sum, s) => sum + s.one_k_games, 0);
      const twoKGames = sessions.reduce((sum, s) => sum + s.two_k_games, 0);
      const totalGames = sessions.reduce((sum, s) => sum + s.games, 0);
      const totalRP = sessions.reduce((sum, s) => sum + (s.total_rp || 0), 0);

      setStats({
        totalKills,
        totalDamage,
        totalRP,
        donuts,
        oneKGames,
        twoKGames,
        totalGames,
        avgDamage: totalGames > 0 ? Math.round(totalDamage / totalGames) : 0,
        avgKills: totalGames > 0 ? Math.round((totalKills / totalGames) * 10) / 10 : 0,
      });

      // Build chart data - aggregate by date
      const dateMap = new Map<string, ChartDataPoint>();
      
      // Build cumulative stats from sessions (including RP)
      let cumulativeRP = 0;
      let cumulativeKills = 0;
      let cumulativeDamage = 0;
      let cumulativeDonuts = 0;
      let cumulative1K = 0;
      let cumulative2K = 0;

      for (const session of sessions) {
        const date = formatDate(session.created_at.split('T')[0]);
        cumulativeRP += session.total_rp || 0;
        cumulativeKills += session.total_kills;
        cumulativeDamage += session.total_damage;
        cumulativeDonuts += session.donuts;
        cumulative1K += session.one_k_games;
        cumulative2K += session.two_k_games;

        if (!dateMap.has(date)) {
          dateMap.set(date, {
            date,
            rp: cumulativeRP,
            kills: cumulativeKills,
            damage: cumulativeDamage,
            donuts: cumulativeDonuts,
            oneK: cumulative1K,
            twoK: cumulative2K,
          });
        } else {
          const point = dateMap.get(date)!;
          point.rp = cumulativeRP;
          point.kills = cumulativeKills;
          point.damage = cumulativeDamage;
          point.donuts = cumulativeDonuts;
          point.oneK = cumulative1K;
          point.twoK = cumulative2K;
        }
      }

      // Sort by date and set
      const sortedData = Array.from(dateMap.values()).sort((a, b) => 
        a.date.localeCompare(b.date)
      );
      setChartData(sortedData);

    } catch (err) {
      console.error('Failed to load player stats:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (isoDate: string): string => {
    const [, month, day] = isoDate.split('-');
    return `${month}/${day}`;
  };

  const toggleMetric = (metric: string) => {
    setVisibleMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const handleCreateSession = async () => {
    if (!profile || !season) return;
    
    setCreatingSession(true);
    try {
      // Create initial doc with host as first player
      const initialDoc = {
        players: [{
          odlId: crypto.randomUUID(),
          odlierId: profile.id,
          name: profile.display_name,
          games: 0,
          totalDamage: 0,
          totalKills: 0,
          oneKGames: 0,
          twoKGames: 0,
          donuts: 0,
          totalRP: 0,
        }],
        sessionGames: 0,
        wins: 0,
        totalPlacement: 0,
        placements: [],
      };

      const res = await fetch('/api/post-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonNumber: season.season_number,
          hostUserId: profile.id,
          doc: initialDoc,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create session');

      // Store write key for host
      localStorage.setItem(`apex:session:${json.sessionId}:writeKey`, json.writeKey);
      
      success('Session created!');
      router.push(`/app/in-game-tracker?code=${json.sessionCode}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      showError('Failed to create session. Please try again.');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleJoinSession = async () => {
    if (!profile || joinCode.length !== 6) return;

    setJoiningSession(true);
    setJoinError(null);

    try {
      // Lookup session by code
      const res = await fetch(`/api/post-session?code=${joinCode}`);
      const json = await res.json();

      if (!res.ok || !json.session) {
        setJoinError('Invalid or expired session code.');
        setJoiningSession(false);
        return;
      }

      const session = json.session;

      // Add this player to the session doc if not already in it
      const doc = session.doc;
      const alreadyInSession = doc.players.some((p: { odlierId: string }) => p.odlierId === profile.id);
      
      if (!alreadyInSession) {
        doc.players.push({
          odlId: crypto.randomUUID(),
          odlierId: profile.id,
          name: profile.display_name,
          games: 0,
          totalDamage: 0,
          totalKills: 0,
          oneKGames: 0,
          twoKGames: 0,
          donuts: 0,
          totalRP: 0,
        });

        // Update the session with new player
        await fetch('/api/post-session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            doc,
            playerIdUpdating: profile.id,
          }),
        });
      }

      success('Joined session!');
      router.push(`/app/in-game-tracker?code=${session.session_code}`);
    } catch (err) {
      console.error('Failed to join session:', err);
      setJoinError('Failed to join session. Please try again.');
    } finally {
      setJoiningSession(false);
    }
  };

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
    router.push('/gate');
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-secondary">Redirecting to login...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-primary py-8">
      <div className="page-container page-transition">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-accent/20">
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary">
              Welcome back, <span className="text-accent">{profile.display_name}</span>
            </h1>
            <p className="text-secondary text-sm">
              {season ? `Season ${season.season_number}` : 'No active season'} • Here&apos;s your performance overview
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mb-6 border-b border-themed pb-4">
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-accent/10 text-accent border-b-2 border-accent'
                : 'text-tertiary hover:text-primary'
            }`}
          >
            📊 My Stats
          </button>
          <button
            onClick={() => { setActiveTab('session'); setSessionView('choice'); }}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === 'session'
                ? 'bg-accent/10 text-accent border-b-2 border-accent'
                : 'text-tertiary hover:text-primary'
            }`}
          >
            🎮 Play Session
          </button>
        </div>

        {/* My Stats Tab */}
        {activeTab === 'stats' && (
          <div className="page-transition">
            {!season ? (
              <div className="card p-8 text-center">
                <p className="text-secondary">No active season. Stats will appear once a season is set.</p>
              </div>
            ) : !stats || stats.totalGames === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-4">📊</div>
                <h3 className="text-lg font-semibold text-primary mb-2">No stats yet</h3>
                <p className="text-secondary text-sm">Play some games to see your stats here!</p>
              </div>
            ) : (
              <>
                {/* Main Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="stat-card">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-glow flex items-center justify-center text-lg">🎯</div>
                      <span className="text-xs text-tertiary uppercase tracking-wider">Total Kills</span>
                    </div>
                    <div className="text-2xl font-bold text-primary">{stats.totalKills.toLocaleString()}</div>
                    <div className="text-xs text-tertiary mt-1">{stats.avgKills} per game</div>
                  </div>

                  <div className="stat-card">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-accent-glow flex items-center justify-center text-lg">💥</div>
                      <span className="text-xs text-tertiary uppercase tracking-wider">Total Damage</span>
                    </div>
                    <div className="text-2xl font-bold text-primary">{stats.totalDamage.toLocaleString()}</div>
                    <div className="text-xs text-tertiary mt-1">{stats.avgDamage.toLocaleString()} avg</div>
                  </div>

                  <div className="stat-card" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, transparent 100%)' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-lg">📈</div>
                      <span className="text-xs text-tertiary uppercase tracking-wider">Total RP</span>
                    </div>
                    <div className={`text-2xl font-bold ${stats.totalRP >= 0 ? 'text-success' : 'text-error'}`}>
                      {stats.totalRP > 0 ? '+' : ''}{stats.totalRP.toLocaleString()}
                    </div>
                    <div className="text-xs text-tertiary mt-1">{stats.totalGames} games</div>
                  </div>

                  <div className="stat-card" style={{ borderColor: 'rgba(139, 92, 246, 0.3)', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, transparent 100%)' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-lg">🍩</div>
                      <span className="text-xs text-tertiary uppercase tracking-wider">Donuts</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-400">{stats.donuts}</div>
                    <div className="text-xs text-tertiary mt-1">Zero kill games</div>
                  </div>
                </div>

                {/* Secondary Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="card p-4">
                    <div className="text-xs text-tertiary uppercase tracking-wider mb-1">1K+ Games</div>
                    <div className="text-xl font-bold text-warning">{stats.oneKGames}</div>
                  </div>
                  <div className="card p-4">
                    <div className="text-xs text-tertiary uppercase tracking-wider mb-1">2K+ Games</div>
                    <div className="text-xl font-bold text-warning">{stats.twoKGames}</div>
                  </div>
                  <div className="card p-4">
                    <div className="text-xs text-tertiary uppercase tracking-wider mb-1">Games Played</div>
                    <div className="text-xl font-bold text-primary">{stats.totalGames}</div>
                  </div>
                  <div className="card p-4">
                    <div className="text-xs text-tertiary uppercase tracking-wider mb-1">Avg Damage</div>
                    <div className="text-xl font-bold text-primary">{stats.avgDamage.toLocaleString()}</div>
                  </div>
                </div>

                {/* Performance Graph */}
                {chartData.length > 0 && (
                  <div className="card p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="section-header mb-0">
                        <div className="indicator" />
                        <div className="title">Performance Over Time</div>
                      </div>
                    </div>

                    {/* Metric Toggles */}
                    <div className="flex flex-wrap gap-2 mb-6 p-3 bg-secondary rounded-xl">
                      {Object.entries(METRIC_CONFIG).map(([key, config]) => (
                        <label
                          key={key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                            visibleMetrics.includes(key)
                              ? 'border border-current'
                              : 'border border-transparent hover:bg-card-hover'
                          }`}
                          style={{
                            color: visibleMetrics.includes(key) ? config.color : 'var(--text-tertiary)',
                            backgroundColor: visibleMetrics.includes(key) ? `${config.color}15` : undefined,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={visibleMetrics.includes(key)}
                            onChange={() => toggleMetric(key)}
                            className="hidden"
                          />
                          <div
                            className="w-3 h-3 rounded-sm border-2"
                            style={{
                              borderColor: config.color,
                              backgroundColor: visibleMetrics.includes(key) ? config.color : 'transparent',
                            }}
                          />
                          <span className="text-sm font-medium">{config.label}</span>
                        </label>
                      ))}
                    </div>

                    {/* Chart */}
                    <div style={{ width: '100%', height: 300 }}>
                      <ResponsiveContainer>
                        <LineChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
                            axisLine={{ stroke: 'var(--border-primary)' }}
                            tickLine={{ stroke: 'var(--border-primary)' }}
                          />
                          <YAxis 
                            tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
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
                          />
                          <Legend />
                          {visibleMetrics.map((metric) => (
                            <Line
                              key={metric}
                              type="monotone"
                              dataKey={metric}
                              name={METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG].label}
                              stroke={METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG].color}
                              strokeWidth={2}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Play Session Tab */}
        {activeTab === 'session' && (
          <div className="page-transition">
            {!season ? (
              <div className="card p-8 text-center">
                <div className="text-4xl mb-4">🎮</div>
                <h3 className="text-lg font-semibold text-primary mb-2">No Active Season</h3>
                <p className="text-secondary text-sm">A season must be active to start or join sessions.</p>
              </div>
            ) : sessionView === 'choice' ? (
              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {/* Host Session */}
                <button
                  onClick={handleCreateSession}
                  disabled={creatingSession}
                  className="card card-interactive p-8 text-left group disabled:opacity-70"
                >
                  <div className="w-16 h-16 rounded-2xl bg-accent-glow flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">
                    🎮
                  </div>
                  <h2 className="text-xl font-bold text-primary mb-2">Host Session</h2>
                  <p className="text-secondary text-sm mb-6">
                    Start a new session and invite your squad with a 6-digit code
                  </p>
                  <div className="inline-flex items-center gap-2 text-accent font-semibold">
                    {creatingSession ? 'Creating...' : 'Create Session'}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                {/* Join Session */}
                <button
                  onClick={() => setSessionView('join')}
                  className="card card-interactive p-8 text-left group"
                >
                  <div className="w-16 h-16 rounded-2xl bg-info/10 flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">
                    🔗
                  </div>
                  <h2 className="text-xl font-bold text-primary mb-2">Join Session</h2>
                  <p className="text-secondary text-sm mb-6">
                    Enter a 6-digit code from your squad&apos;s host to join
                  </p>
                  <div className="inline-flex items-center gap-2 text-info font-semibold">
                    Enter Code
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </div>
            ) : (
              <div className="max-w-md mx-auto">
                <button
                  onClick={() => setSessionView('choice')}
                  className="flex items-center gap-2 text-tertiary hover:text-primary mb-6 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>

                <div className="card p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-info/10 flex items-center justify-center text-3xl mx-auto mb-6">
                    🔗
                  </div>
                  <h2 className="text-xl font-bold text-primary mb-2">Join Session</h2>
                  <p className="text-secondary text-sm mb-6">
                    Enter the 6-digit code from your host
                  </p>

                  {joinError && (
                    <div className="mb-4 p-3 rounded-lg bg-error/10 border border-error/30 text-error text-sm">
                      {joinError}
                    </div>
                  )}

                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="input text-center text-3xl font-bold tracking-[0.5em] mb-6"
                    style={{ letterSpacing: '0.3em' }}
                  />

                  <button
                    onClick={handleJoinSession}
                    disabled={joinCode.length !== 6 || joiningSession}
                    className="btn-primary w-full py-3"
                  >
                    {joiningSession ? 'Joining...' : 'Join Session'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
