'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import ConfirmModal from '@/components/ConfirmModal';
import {
  fetchMyProfile,
  logout,
  onAuthStateChange,
  type Profile,
} from '@/lib/auth';
import {
  getActiveSeason,
  setActiveSeason,
  resetCurrentSeason,
  deactivateSeason,
  joinActiveSeason,
  type Season,
} from '@/lib/seasons';

export default function Home() {
  const router = useRouter();

  // Auth state
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Season state
  const [season, setSeason] = useState<Season | null>(null);
  const [seasonInput, setSeasonInput] = useState('28');
  const [seasonLoading, setSeasonLoading] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Confirmation modals
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [profileData, seasonData] = await Promise.all([
        fetchMyProfile(),
        getActiveSeason(),
      ]);
      setProfile(profileData);
      setSeason(seasonData);
      if (seasonData) {
        setSeasonInput(String(seasonData.season_number));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auth listener
  useEffect(() => {
    loadData();

    const unsubscribe = onAuthStateChange(() => {
      loadData();
    });

    return unsubscribe;
  }, [loadData]);

  // Handle auth success
  async function handleAuthSuccess() {
    setLoading(true);
    await loadData();
  }

  // Handle logout
  async function handleLogout() {
    try {
      await logout();
      setProfile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      setError(message);
    }
  }

  // Handle set season
  async function handleSetSeason() {
    const num = parseInt(seasonInput, 10);
    if (isNaN(num) || num < 1) {
      setError('Please enter a valid season number');
      return;
    }

    setSeasonLoading(true);
    setError(null);

    try {
      const newSeason = await setActiveSeason(num);
      setSeason(newSeason);

      // Auto-join the season
      await joinActiveSeason();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set season';
      setError(message);
    } finally {
      setSeasonLoading(false);
    }
  }

  // Handle reset season (after confirmation)
  async function handleResetSeason() {
    setShowResetConfirm(false);
    setSeasonLoading(true);
    setError(null);

    try {
      await resetCurrentSeason();
      await deactivateSeason();
      setSeason(null);
      setSeasonInput('28');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset season';
      setError(message);
    } finally {
      setSeasonLoading(false);
    }
  }

  // Styles
  const card =
    'w-full rounded-2xl border border-[#2A2E32] bg-[#121418] p-6 shadow-sm';
  const title =
    'text-4xl sm:text-6xl font-extrabold tracking-tight text-[#E03A3E]';
  const btnPrimary =
    'cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed';
  const btnGhost =
    'cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-3 text-sm font-semibold text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed';
  const btnDanger =
    'cursor-pointer inline-flex items-center justify-center rounded-xl border border-red-600/50 bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-400 shadow-sm hover:bg-red-600/20 hover:border-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed';
  const inputClass =
    'w-full sm:w-32 rounded-xl border border-[#2A2E32] bg-[#0E1115] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-50 disabled:cursor-not-allowed';

  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-sm text-slate-400">Loading…</div>
      </main>
    );
  }

  // Not logged in - show auth form
  if (!profile) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="uppercase tracking-[0.35em] text-[10px] text-slate-500 mb-2">
              Apex Legends
            </div>
            <h1 className={title}>Trio Tracker</h1>
            <p className="mt-3 text-sm text-slate-400">
              Sign in to start tracking with your squad.
            </p>
          </div>

          <AuthForm onSuccess={handleAuthSuccess} />
        </div>
      </main>
    );
  }

  // Logged in - show main dashboard
  return (
    <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="uppercase tracking-[0.35em] text-[10px] text-slate-500 mb-2">
            Apex Legends
          </div>
          <h1 className={title}>Trio Tracker</h1>
          <p className="mt-3 text-sm text-slate-400">
            You&apos;re signed in as{' '}
            <span className="text-slate-100 font-semibold">
              {profile.display_name}
            </span>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Season Card */}
        <div className={card}>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-4">
            Current Season
          </div>

          {season ? (
            // Season is set
            <div>
              <div className="flex items-center gap-4 mb-4">
                <div className="text-3xl font-bold text-[#E03A3E]">
                  Season {season.season_number}
                </div>
                <div className="text-sm text-slate-500">Active</div>
              </div>

              <div className="flex flex-wrap gap-3">
                <input
                  type="number"
                  value={seasonInput}
                  disabled
                  className={inputClass}
                />
                <button disabled className={btnPrimary}>
                  Set Season
                </button>
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={seasonLoading}
                  className={btnDanger}
                >
                  {seasonLoading ? 'Resetting…' : 'Reset Season'}
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                To change seasons, you must reset first. This will clear all RP
                data for this season.
              </p>
            </div>
          ) : (
            // No season set
            <div>
              <p className="text-sm text-slate-400 mb-4">
                No season is currently active. Set a season to start tracking.
              </p>

              <div className="flex flex-wrap gap-3">
                <input
                  type="number"
                  value={seasonInput}
                  onChange={(e) => setSeasonInput(e.target.value)}
                  placeholder="28"
                  min={1}
                  className={inputClass}
                />
                <button
                  onClick={handleSetSeason}
                  disabled={seasonLoading || !seasonInput}
                  className={btnPrimary}
                >
                  {seasonLoading ? 'Setting…' : 'Set Season'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Cards */}
        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          <button
            onClick={() => router.push('/in-game-tracker')}
            disabled={!season}
            className={`${card} text-left hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="text-lg font-bold text-slate-100">
              In-Game Tracker
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Start a session and track stats with your squad in real-time.
            </p>
          </button>

          <button
            onClick={() => router.push('/season-progression')}
            disabled={!season}
            className={`${card} text-left hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="text-lg font-bold text-slate-100">
              Season Progression
            </div>
            <p className="mt-1 text-sm text-slate-400">
              View the RP graph showing everyone&apos;s progress this season.
            </p>
          </button>
        </div>

        {/* Sign out */}
        <div className="mt-8 text-center">
          <button onClick={handleLogout} className={btnGhost}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset Season?"
        message="This will delete all RP entries for this season and deactivate it. Everyone's progress will be reset to 0. This cannot be undone."
        confirmText="Yes, Reset"
        cancelText="Cancel"
        onConfirm={handleResetSeason}
        onCancel={() => setShowResetConfirm(false)}
        variant="danger"
      />
    </main>
  );
}
