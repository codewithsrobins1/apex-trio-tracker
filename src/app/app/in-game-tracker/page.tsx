'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, type Profile } from '@/lib/auth';
import { getActiveSeason, type Season } from '@/lib/seasons';
import {
  getLiveSessionByCode,
  getLiveSession,
  getSessionPlayers,
  getSessionGames,
  getGamePlayerStats,
  addPlayerToSession,
  updatePlayerRp,
  updatePlayerRpAsHost,
  addGame,
  upsertPlayerGameStats,
  endSession,
  type LiveSession,
  type LiveSessionPlayer,
  type GameStat,
  type PlayerGameStat,
} from '@/lib/liveSessions';
import { useRealtimeSession } from '@/hooks/useRealtimeSession';
import { useToast } from '@/components/ToastProvider';
import ConfirmModal from '@/components/ConfirmModal';
import EndSessionModal from '@/components/EndSessionModal';
import SessionCodeBanner from '@/components/SessionCodeBanner';

type Player = {
  odlId: string;
  odlierId: string;
  name: string;
  damageInput: string;
  killsInput: string;
  games: number;
  totalDamage: number;
  totalKills: number;
  oneKGames: number;
  twoKGames: number;
  donuts: number;
  rpInput: string;
  currentRp: number;
};

function InGameTrackerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionCode = searchParams.get('code');
  const { success, error: showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [isHost, setIsHost] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [sessionGames, setSessionGames] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameStat[]>([]);

  const [showEndSessionModal, setShowEndSessionModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState('');

  const [savingRp, setSavingRp] = useState<string | null>(null);
  const [addingGame, setAddingGame] = useState(false);

  // Load session data
  const loadSessionData = useCallback(async () => {
    if (!session) return;

    try {
      const [playersData, gamesData] = await Promise.all([
        getSessionPlayers(session.id),
        getSessionGames(session.id),
      ]);

      // Build player objects with aggregated stats
      const playerMap = new Map<string, Player>();
      
      for (const p of playersData) {
        playerMap.set(p.user_id, {
          odlId: p.id,
          odlierId: p.user_id,
          name: p.display_name || 'Unknown',
          damageInput: '',
          killsInput: '',
          games: 0,
          totalDamage: 0,
          totalKills: 0,
          oneKGames: 0,
          twoKGames: 0,
          donuts: 0,
          rpInput: '',
          currentRp: p.current_rp,
        });
      }

      // Aggregate stats from games
      for (const game of gamesData) {
        const stats = await getGamePlayerStats(game.id);
        for (const stat of stats) {
          const player = playerMap.get(stat.user_id);
          if (player) {
            player.games++;
            player.totalDamage += stat.damage;
            player.totalKills += stat.kills;
            if (stat.damage >= 1000) player.oneKGames++;
            if (stat.damage >= 2000) player.twoKGames++;
            if (stat.kills === 0) player.donuts++;
          }
        }
      }

      setPlayers(Array.from(playerMap.values()));
      setGameHistory(gamesData);
      setSessionGames(gamesData.length);
    } catch (err) {
      console.error('Failed to load session data:', err);
    }
  }, [session]);

  // Realtime subscriptions (no connection warnings - app works fine without realtime)
  useRealtimeSession({
    sessionId: session?.id ?? null,
    onPlayersChange: loadSessionData,
    onGamesChange: loadSessionData,
    onStatsChange: loadSessionData,
  });

  // Initial load
  useEffect(() => {
    const init = async () => {
      try {
        const [profileData, seasonData] = await Promise.all([
          fetchMyProfile(),
          getActiveSeason(),
        ]);

        setProfile(profileData);
        setSeason(seasonData);

        if (!profileData || !seasonData || !sessionCode) {
          setLoading(false);
          return;
        }

        // Find session by code
        const sessionData = await getLiveSessionByCode(sessionCode);
        
        if (!sessionData) {
          showError('Session not found or has expired.');
          router.push('/app');
          return;
        }

        if (!sessionData.is_active) {
          showError('This session has ended.');
          router.push('/app');
          return;
        }

        setSession(sessionData);
        setIsHost(sessionData.host_user_id === profileData.id);

        // Try to add player to session (will just return existing if already in)
        try {
          await addPlayerToSession(sessionData.id, profileData.id);
        } catch (err) {
          // Player might already be in session, that's ok
          console.log('Player already in session or error:', err);
        }

        setLoading(false);
      } catch (err) {
        console.error('Failed to initialize:', err);
        showError('Failed to load session.');
        setLoading(false);
      }
    };

    init();
  }, [sessionCode, router, showError]);

  // Load data when session is set
  useEffect(() => {
    if (session) {
      loadSessionData();
    }
  }, [session, loadSessionData]);

  // Handle RP change
  const handleRpChange = async (player: Player, newRpInput: string) => {
    // Update local state immediately
    setPlayers(prev => prev.map(p => 
      p.odlierId === player.odlierId ? { ...p, rpInput: newRpInput } : p
    ));
  };

  // Save RP to database
  const handleRpBlur = async (player: Player) => {
    if (!session || !profile) return;
    
    const newRp = parseInt(player.rpInput) || 0;
    if (newRp === player.currentRp) return;

    setSavingRp(player.odlierId);
    
    try {
      let result;
      
      // If current user is editing their own RP, or host is editing anyone's
      if (player.odlierId === profile.id) {
        result = await updatePlayerRp(session.id, newRp);
      } else if (isHost) {
        result = await updatePlayerRpAsHost(session.id, player.odlierId, newRp);
      } else {
        showError('You can only edit your own RP.');
        // Reset input
        setPlayers(prev => prev.map(p => 
          p.odlierId === player.odlierId ? { ...p, rpInput: '' } : p
        ));
        setSavingRp(null);
        return;
      }

      if (result.success) {
        success('RP saved!');
        // Update local state with new RP
        setPlayers(prev => prev.map(p => 
          p.odlierId === player.odlierId ? { ...p, currentRp: newRp, rpInput: '' } : p
        ));
      } else {
        showError(result.error || 'Failed to save RP.');
      }
    } catch (err) {
      console.error('Failed to save RP:', err);
      showError('Failed to save RP. Please try again.');
    } finally {
      setSavingRp(null);
    }
  };

  // Handle damage/kills input change
  const handleInputChange = (playerId: string, field: 'damageInput' | 'killsInput', value: string) => {
    setPlayers(prev => prev.map(p =>
      p.odlierId === playerId ? { ...p, [field]: value } : p
    ));
  };

  // Add game
  const handleAddGame = async () => {
    if (!session || !isHost) return;

    // Validate inputs
    const invalidPlayers = players.filter(p => {
      const damage = parseInt(p.damageInput);
      const kills = parseInt(p.killsInput);
      return isNaN(damage) || isNaN(kills) || damage < 0 || kills < 0;
    });

    if (invalidPlayers.length > 0) {
      showError('Please enter valid damage and kills for all players.');
      return;
    }

    setAddingGame(true);

    try {
      // Create game
      const game = await addGame(session.id, sessionGames + 1);

      // Add stats for each player
      for (const player of players) {
        const damage = parseInt(player.damageInput) || 0;
        const kills = parseInt(player.killsInput) || 0;
        await upsertPlayerGameStats(game.id, player.odlierId, damage, kills);
      }

      // Clear inputs
      setPlayers(prev => prev.map(p => ({ ...p, damageInput: '', killsInput: '' })));
      success('Game added!');
    } catch (err) {
      console.error('Failed to add game:', err);
      showError('Failed to add game. Please try again.');
    } finally {
      setAddingGame(false);
    }
  };

  // End session
  const handleEndSession = async (postToDiscord: boolean) => {
    if (!session || !isHost) return;

    try {
      await endSession(session.id, postToDiscord);
      success(postToDiscord ? 'Session ended and posted to Discord!' : 'Session ended!');
      router.push('/app');
    } catch (err) {
      console.error('Failed to end session:', err);
      showError('Failed to end session. Please try again.');
    }
  };

  // Leave session (non-host)
  const handleLeaveSession = () => {
    router.push('/app');
  };

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-secondary">Loading session...</p>
        </div>
      </main>
    );
  }

  if (!profile || !season || !session) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center px-4">
        <div className="card p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🎮</div>
          <h2 className="text-xl font-bold text-primary mb-2">Session Not Found</h2>
          <p className="text-secondary text-sm mb-6">
            The session may have ended or the code is invalid.
          </p>
          <button onClick={() => router.push('/app')} className="btn-primary">
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-primary py-6">
      <div className="page-container page-transition">
        {/* Session Code Banner */}
        <SessionCodeBanner code={session.session_code} isHost={isHost} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-primary">Live Session</h1>
            <p className="text-sm text-secondary">
              Season {season.season_number} • {sessionGames} games played
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="live-indicator">
              <span className="live-dot" />
              <span>Live</span>
            </div>
          </div>
        </div>

        {/* Players Table */}
        <div className="card overflow-hidden mb-6">
          <div className="p-4 border-b border-themed">
            <div className="section-header mb-0">
              <div className="indicator" />
              <div className="title">Players ({players.length}/3)</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="text-center">Games</th>
                  <th className="text-center">Damage</th>
                  <th className="text-center">Kills</th>
                  <th className="text-center">1K</th>
                  <th className="text-center">2K</th>
                  <th className="text-center">Donuts</th>
                  <th className="text-center">RP</th>
                  {isHost && <th className="text-center">Add Game</th>}
                </tr>
              </thead>
              <tbody>
                {players.map((player) => (
                  <tr key={player.odlierId}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-primary">{player.name}</span>
                        {player.odlierId === session.host_user_id && (
                          <span className="badge badge-host">HOST</span>
                        )}
                      </div>
                    </td>
                    <td className="text-center">{player.games}</td>
                    <td className="text-center">{player.totalDamage.toLocaleString()}</td>
                    <td className="text-center">{player.totalKills}</td>
                    <td className="text-center text-warning font-medium">{player.oneKGames}</td>
                    <td className="text-center text-warning font-medium">{player.twoKGames}</td>
                    <td className="text-center text-purple-400">{player.donuts}</td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* Show RP input for own user, or all users if host */}
                        {(player.odlierId === profile.id || isHost) ? (
                          <div className="relative">
                            <input
                              type="number"
                              value={player.rpInput || ''}
                              onChange={(e) => handleRpChange(player, e.target.value)}
                              onBlur={() => handleRpBlur(player)}
                              placeholder={player.currentRp.toString()}
                              className="input w-20 text-center py-1 text-sm"
                            />
                            {savingRp === player.odlierId && (
                              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={`font-medium ${player.currentRp >= 0 ? 'text-success' : 'text-error'}`}>
                            {player.currentRp > 0 ? '+' : ''}{player.currentRp}
                          </span>
                        )}
                      </div>
                    </td>
                    {isHost && (
                      <td>
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="number"
                            value={player.damageInput}
                            onChange={(e) => handleInputChange(player.odlierId, 'damageInput', e.target.value)}
                            placeholder="Dmg"
                            min={0}
                            className="input w-20 text-center py-1 text-sm"
                          />
                          <input
                            type="number"
                            value={player.killsInput}
                            onChange={(e) => handleInputChange(player.odlierId, 'killsInput', e.target.value)}
                            placeholder="Kills"
                            min={0}
                            className="input w-16 text-center py-1 text-sm"
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {isHost ? (
            <>
              <button
                onClick={handleAddGame}
                disabled={addingGame || players.length === 0}
                className="btn-primary"
              >
                {addingGame ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Game
                  </>
                )}
              </button>
              <button
                onClick={() => setShowEndSessionModal(true)}
                className="btn-danger"
              >
                End Session
              </button>
            </>
          ) : (
            <button onClick={handleLeaveSession} className="btn-secondary">
              Leave Session
            </button>
          )}
        </div>

        {/* Game History */}
        {gameHistory.length > 0 && (
          <div className="mt-8">
            <div className="section-header">
              <div className="indicator" />
              <div className="title">Game History</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {gameHistory.map((game, idx) => (
                <div key={game.id} className="card p-3 text-center">
                  <div className="text-xs text-tertiary mb-1">Game {idx + 1}</div>
                  <div className="text-sm text-secondary">
                    {new Date(game.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* End Session Modal */}
      <EndSessionModal
        isOpen={showEndSessionModal}
        onClose={() => setShowEndSessionModal(false)}
        onEndSession={handleEndSession}
      />

      {/* Generic Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        title="Confirm Action"
        message={confirmMessage}
        confirmText="Confirm"
        cancelText="Cancel"
        onConfirm={async () => {
          if (confirmAction) await confirmAction();
          setShowConfirmModal(false);
          setConfirmAction(null);
        }}
        onCancel={() => {
          setShowConfirmModal(false);
          setConfirmAction(null);
        }}
      />
    </main>
  );
}

export default function InGameTrackerPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-4rem)] bg-primary flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-secondary">Loading...</p>
          </div>
        </main>
      }
    >
      <InGameTrackerContent />
    </Suspense>
  );
}
