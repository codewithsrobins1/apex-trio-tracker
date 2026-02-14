'use client';

import {
  Suspense,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { fetchMyProfile, fetchAllProfiles, type Profile } from '@/lib/auth';
import { getActiveSeason, type Season } from '@/lib/seasons';
import ConfirmModal from '@/components/ConfirmModal';
import { copyToClipboard } from '@/helpers/copyToClipboard';

// ===== Types =====
type GameEntry = { damage: number; kills: number };
type Player = {
  odlId: string;
  odlierId: string | null;
  name: string;
  damageInput: string;
  killsInput: string;
  games: number;
  totalDamage: number;
  totalKills: number;
  oneKGames: number;
  twoKGames: number;
  donuts: number;
  history: GameEntry[];
  rpInput: string;
  totalRP: number;
  rpHistory: number[];
};

type GameFrame = {
  entries: { odlId: string; entry: GameEntry }[];
  placement: number;
};

type SessionDoc = {
  players: {
    odlId: string;
    odlierId: string | null;
    name: string;
    games: number;
    totalDamage: number;
    totalKills: number;
    oneKGames: number;
    twoKGames: number;
    donuts: number;
    totalRP: number;
  }[];
  sessionGames: number;
  wins: number;
  totalPlacement: number;
  placements: number[];
  lastUpdated?: string;
};

function InGameTrackerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionCodeFromUrl = searchParams.get('code');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  const makeNewPlayer = useCallback(
    (odlierId: string | null = null, name: string = ''): Player => ({
      odlId: crypto.randomUUID(),
      odlierId,
      name,
      damageInput: '',
      killsInput: '',
      games: 0,
      totalDamage: 0,
      totalKills: 0,
      oneKGames: 0,
      twoKGames: 0,
      donuts: 0,
      history: [],
      rpInput: '',
      totalRP: 0,
      rpHistory: [],
    }),
    []
  );

  const [players, setPlayers] = useState<Player[]>([]);
  const [sessionGames, setSessionGames] = useState(0);
  const [gameHistory, setGameHistory] = useState<GameFrame[]>([]);
  const [wins, setWins] = useState(0);
  const [totalPlacement, setTotalPlacement] = useState(0);
  const [placements, setPlacements] = useState<number[]>([]);
  const [placementInput, setPlacementInput] = useState('');

  const [showNewSessionConfirm, setShowNewSessionConfirm] = useState(false);
  const [showEndSession, setShowEndSession] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Session code state
  const [sessionCode, setSessionCode] = useState<string | null>(
    sessionCodeFromUrl
  );

  // NEW: Notification modal state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<
    'success' | 'error' | 'info'
  >('info');

  // NEW: Refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const autoRefreshInterval = useRef<NodeJS.Timeout | null>(null);

  // NEW: Saving RP state
  const [savingRP, setSavingRP] = useState<string | null>(null); // odlId of player being saved

  const MAX_PLAYERS = 3;

  // Helper to show notification modal
  const showNotificationModal = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' = 'info'
  ) => {
    setNotificationTitle(title);
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
  };

  // Helper to save full state to localStorage
  const saveToLocalStorage = useCallback(
    (sessionId: string, doc: SessionDoc) => {
      try {
        localStorage.setItem(
          `apex:session:${sessionId}:fullState`,
          JSON.stringify({
            ...doc,
            lastUpdated: new Date().toISOString(),
          })
        );
      } catch (err) {
        console.error('Failed to save to localStorage:', err);
      }
    },
    []
  );

  // Helper to load from localStorage
  const loadFromLocalStorage = useCallback(
    (sessionId: string): SessionDoc | null => {
      try {
        const stored = localStorage.getItem(
          `apex:session:${sessionId}:fullState`
        );
        if (!stored) return null;
        return JSON.parse(stored);
      } catch (err) {
        console.error('Failed to load from localStorage:', err);
        return null;
      }
    },
    []
  );

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [profileData, seasonData, profiles] = await Promise.all([
        fetchMyProfile(),
        getActiveSeason(),
        fetchAllProfiles(),
      ]);
      setProfile(profileData);
      setSeason(seasonData);
      setAllProfiles(profiles);

      if (!profileData || !seasonData) {
        setLoading(false);
        return;
      }

      if (sessionCodeFromUrl) {
        // Lookup session by code
        const res = await fetch(`/api/post-session?code=${sessionCodeFromUrl}`);
        const json = await res.json();

        if (!res.ok || !json.session) {
          setError('Session not found');
          setLoading(false);
          return;
        }

        const sessionData = json.session;
        const doc = sessionData.doc as SessionDoc;
        const writeKey = localStorage.getItem(
          `apex:session:${sessionData.id}:writeKey`
        );
        const isHostUser =
          writeKey !== null && sessionData.host_user_id === profileData.id;

        setIsHost(isHostUser);
        setSessionId(sessionData.id);
        setSessionCode(sessionData.session_code);

        // Try to load from localStorage first
        const localData = loadFromLocalStorage(sessionData.id);

        // Use database data but merge with localStorage if available and newer
        const finalDoc =
          localData &&
          localData.lastUpdated &&
          new Date(localData.lastUpdated) > new Date(sessionData.updated_at)
            ? localData
            : doc;

        setPlayers(
          finalDoc.players.map((p) => ({
            ...makeNewPlayer(p.odlierId, p.name),
            odlId: p.odlId,
            odlierId: p.odlierId,
            name: p.name,
            games: p.games,
            totalDamage: p.totalDamage,
            totalKills: p.totalKills,
            oneKGames: p.oneKGames,
            twoKGames: p.twoKGames,
            donuts: p.donuts,
            totalRP: p.totalRP,
          }))
        );
        setSessionGames(finalDoc.sessionGames);
        setWins(finalDoc.wins);
        setTotalPlacement(finalDoc.totalPlacement);
        setPlacements(finalDoc.placements || []);

        setLastRefreshed(new Date());
      } else {
        setPlayers([makeNewPlayer(profileData.id, profileData.display_name)]);
        setIsHost(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [sessionCodeFromUrl, makeNewPlayer, loadFromLocalStorage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // NEW: Manual refresh function
  const handleRefresh = async () => {
    if (!sessionId) return;

    setRefreshing(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;

      if (sessionData) {
        const doc = sessionData.doc as SessionDoc;

        setPlayers(
          doc.players.map((p) => ({
            ...makeNewPlayer(p.odlierId, p.name),
            odlId: p.odlId,
            odlierId: p.odlierId,
            name: p.name,
            games: p.games,
            totalDamage: p.totalDamage,
            totalKills: p.totalKills,
            oneKGames: p.oneKGames,
            twoKGames: p.twoKGames,
            donuts: p.donuts,
            totalRP: p.totalRP,
          }))
        );
        setSessionGames(doc.sessionGames);
        setWins(doc.wins);
        setTotalPlacement(doc.totalPlacement);
        setPlacements(doc.placements || []);

        setLastRefreshed(new Date());

        // Save to localStorage
        saveToLocalStorage(sessionId, doc);
      }
    } catch (err) {
      console.error('Failed to refresh:', err);
      showNotificationModal(
        'Refresh Failed',
        'Could not fetch latest data',
        'error'
      );
    } finally {
      setRefreshing(false);
    }
  };

  // NEW: Auto-refresh every 60 seconds
  useEffect(() => {
    if (!sessionId || isHost) return; // Only auto-refresh for non-hosts

    autoRefreshInterval.current = setInterval(() => {
      handleRefresh();
    }, 60000); // 60 seconds

    return () => {
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
      }
    };
  }, [sessionId, isHost]);

  const currentDoc: SessionDoc = useMemo(
    () => ({
      players: players.map((p) => ({
        odlId: p.odlId,
        odlierId: p.odlierId,
        name: p.name,
        games: p.games,
        totalDamage: p.totalDamage,
        totalKills: p.totalKills,
        oneKGames: p.oneKGames,
        twoKGames: p.twoKGames,
        donuts: p.donuts,
        totalRP: p.totalRP,
      })),
      sessionGames,
      wins,
      totalPlacement,
      placements,
    }),
    [players, sessionGames, wins, totalPlacement, placements]
  );

  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const lastSavedDoc = useRef<string>('');

  useEffect(() => {
    if (!sessionId) return;
    const docString = JSON.stringify(currentDoc);
    if (docString === lastSavedDoc.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        const writeKey = localStorage.getItem(
          `apex:session:${sessionId}:writeKey`
        );
        await fetch('/api/post-session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, writeKey, doc: currentDoc }),
        });
        lastSavedDoc.current = docString;

        // Save to localStorage as backup
        saveToLocalStorage(sessionId, currentDoc);
      } catch (err) {
        console.error('Failed to save session:', err);
      }
    }, 500);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [currentDoc, sessionId, saveToLocalStorage]);

  // Realtime subscription for non-host players
  useEffect(() => {
    if (!sessionId || isHost) return;

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const doc = payload.new.doc as SessionDoc;

          setPlayers((currentPlayers) => {
            return doc.players.map((p) => {
              const isMe = p.odlierId === profile?.id;
              const myCurrentPlayer = currentPlayers.find(
                (cp) => cp.odlierId === p.odlierId
              );

              // For the current user's RP: use the database value
              // This ensures RP updates from the user are reflected
              // (they saved to DB, now DB is pushing back the saved value)
              return {
                ...makeNewPlayer(p.odlierId, p.name),
                odlId: p.odlId,
                odlierId: p.odlierId,
                name: p.name,
                games: p.games,
                totalDamage: p.totalDamage,
                totalKills: p.totalKills,
                oneKGames: p.oneKGames,
                twoKGames: p.twoKGames,
                donuts: p.donuts,
                // Always use DB value for totalRP - it's the source of truth
                totalRP: p.totalRP,
                // Preserve input field only if we're mid-edit
                rpInput: isMe && myCurrentPlayer ? myCurrentPlayer.rpInput : '',
                rpHistory:
                  p.rpHistory ||
                  (isMe && myCurrentPlayer ? myCurrentPlayer.rpHistory : []),
              };
            });
          });

          setSessionGames(doc.sessionGames);
          setWins(doc.wins);
          setTotalPlacement(doc.totalPlacement);
          setPlacements(doc.placements || []);
          setLastRefreshed(new Date());
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isHost, profile?.id, makeNewPlayer]);

  const addToSelection = (playerId: string) => {
    if (selectedPlayerIds.length + players.length >= MAX_PLAYERS) {
      setModalError(`Maximum ${MAX_PLAYERS} players allowed`);
      setTimeout(() => setModalError(null), 3000);
      return;
    }
    setModalError(null);
    setSelectedPlayerIds((prev) => [...prev, playerId]);
  };

  const removeFromSelection = (playerId: string) => {
    setModalError(null);
    setSelectedPlayerIds((prev) => prev.filter((id) => id !== playerId));
  };

  const confirmAddPlayers = () => {
    if (!isHost) return;

    const newPlayers = selectedPlayerIds
      .map((id) => {
        const selectedProfile = allProfiles.find((p) => p.id === id);
        if (!selectedProfile) return null;
        if (players.some((p) => p.odlierId === id)) return null;
        return makeNewPlayer(selectedProfile.id, selectedProfile.display_name);
      })
      .filter((p): p is Player => p !== null);

    setPlayers((prev) => [...prev, ...newPlayers]);
    setShowAddPlayer(false);
    setSelectedPlayerIds([]);
    setModalError(null);
  };

  const cancelAddPlayers = () => {
    setShowAddPlayer(false);
    setSelectedPlayerIds([]);
    setModalError(null);
  };

  const removePlayer = (odlId: string) => {
    if (!isHost) return;
    setPlayers((p) => p.filter((pl) => pl.odlId !== odlId));
  };

  const updateField = <K extends keyof Player>(
    odlId: string,
    field: K,
    value: Player[K]
  ) => {
    const player = players.find((p) => p.odlId === odlId);
    if (!player) return;
    const isRpField =
      field === 'rpInput' || field === 'totalRP' || field === 'rpHistory';
    const isMyPlayer = player.odlierId === profile?.id;
    if (!isHost && !isRpField) return;
    if (!isHost && isRpField && !isMyPlayer) return;
    setPlayers((prev) =>
      prev.map((pl) => (pl.odlId === odlId ? { ...pl, [field]: value } : pl))
    );
  };

  const addGameAll = () => {
    if (!isHost) return;
    const placement = parseInt(placementInput, 10);
    if (!Number.isFinite(placement) || placement < 1 || placement > 20) {
      setError('Please enter a valid placement (1-20)');
      return;
    }
    const anyProvided = players.some(
      (p) => (p.damageInput ?? '') !== '' || (p.killsInput ?? '') !== ''
    );
    if (!anyProvided) {
      setError('Please enter stats for at least one player');
      return;
    }
    setError(null);

    const frame: GameFrame = { entries: [], placement };
    setPlayers((prev) =>
      prev.map((pl) => {
        const dmg = Math.max(0, Number(pl.damageInput) || 0);
        const k = Math.max(0, Number(pl.killsInput) || 0);
        const isDonut = dmg === 0 && k === 0;
        frame.entries.push({
          odlId: pl.odlId,
          entry: { damage: dmg, kills: k },
        });
        return {
          ...pl,
          games: pl.games + 1,
          totalDamage: pl.totalDamage + dmg,
          totalKills: pl.totalKills + k,
          oneKGames: pl.oneKGames + (dmg >= 1000 && dmg < 2000 ? 1 : 0),
          twoKGames: pl.twoKGames + (dmg >= 2000 ? 1 : 0),
          donuts: pl.donuts + (isDonut ? 1 : 0),
          damageInput: '',
          killsInput: '',
          history: [...pl.history, { damage: dmg, kills: k }],
        };
      })
    );
    setSessionGames((g) => g + 1);
    setGameHistory((h) => [...h, frame]);
    setTotalPlacement((tp) => tp + placement);
    setPlacements((p) => [...p, placement]);
    setPlacementInput('');
    if (placement === 1) setWins((w) => w + 1);
  };

  const undoGameAll = () => {
    if (!isHost || gameHistory.length === 0) return;
    const last = gameHistory[gameHistory.length - 1];
    setPlayers((prev) =>
      prev.map((pl) => {
        const rec = last.entries.find((e) => e.odlId === pl.odlId);
        if (!rec) return pl;
        const { damage, kills } = rec.entry;
        const wasDonut = damage === 0 && kills === 0;
        return {
          ...pl,
          games: Math.max(0, pl.games - 1),
          totalDamage: Math.max(0, pl.totalDamage - damage),
          totalKills: Math.max(0, pl.totalKills - kills),
          oneKGames: Math.max(
            0,
            pl.oneKGames - (damage >= 1000 && damage < 2000 ? 1 : 0)
          ),
          twoKGames: Math.max(0, pl.twoKGames - (damage >= 2000 ? 1 : 0)),
          donuts: Math.max(0, pl.donuts - (wasDonut ? 1 : 0)),
          damageInput: String(damage || ''),
          killsInput: String(kills || ''),
          history: pl.history.slice(0, -1),
        };
      })
    );
    setSessionGames((g) => Math.max(0, g - 1));
    setGameHistory((h) => h.slice(0, -1));
    setTotalPlacement((tp) => Math.max(0, tp - last.placement));
    setPlacements((p) => p.slice(0, -1));
    setPlacementInput(String(last.placement));
    if (last.placement === 1) setWins((w) => Math.max(0, w - 1));
  };

  // UPDATED: commitRP now saves to database immediately with correct data
  const commitRP = async (odlId: string) => {
    const player = players.find((p) => p.odlId === odlId);
    if (!player) return;
    if (!isHost && player.odlierId !== profile?.id) return;
    const delta = Number(player.rpInput);
    if (!Number.isFinite(delta) || player.rpInput === '') return;

    const newTotalRP = player.totalRP + delta;
    const newRPHistory = [...player.rpHistory, delta];

    // Show saving state
    setSavingRP(odlId);

    // Update local state first
    setPlayers((prev) =>
      prev.map((pl) =>
        pl.odlId === odlId
          ? {
              ...pl,
              totalRP: newTotalRP,
              rpHistory: newRPHistory,
              rpInput: '',
            }
          : pl
      )
    );

    // Save to database immediately with FRESH data
    if (sessionId && player.odlierId) {
      try {
        // Create updated doc with the new RP value
        const updatedDoc = {
          ...currentDoc,
          players: currentDoc.players.map((p) =>
            p.odlId === odlId ? { ...p, totalRP: newTotalRP } : p
          ),
        };

        // Get writeKey (only host has this)
        const writeKey = localStorage.getItem(
          `apex:session:${sessionId}:writeKey`
        );

        const response = await fetch('/api/post-session', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            writeKey: writeKey || null, // Send null if not host
            doc: updatedDoc,
            playerIdUpdating: player.odlierId, // Tell API which player is updating
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save RP: ${errorText}`);
        }

        // Save to localStorage
        saveToLocalStorage(sessionId, updatedDoc);

        console.log(
          `✅ RP saved: ${player.name} +${delta} (Total: ${newTotalRP})`
        );
      } catch (err) {
        console.error('Failed to save RP to database:', err);
        showNotificationModal(
          'Error',
          `Failed to save RP: ${err instanceof Error ? err.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setSavingRP(null);
      }
    } else {
      setSavingRP(null);
    }
  };

  const undoRP = (odlId: string) => {
    const player = players.find((p) => p.odlId === odlId);
    if (!player || player.rpHistory.length === 0) return;
    if (!isHost && player.odlierId !== profile?.id) return;
    const last = player.rpHistory[player.rpHistory.length - 1];
    setPlayers((prev) =>
      prev.map((pl) =>
        pl.odlId === odlId
          ? {
              ...pl,
              totalRP: pl.totalRP - last,
              rpHistory: pl.rpHistory.slice(0, -1),
              rpInput: String(last),
            }
          : pl
      )
    );
  };

  const createSession = async () => {
    if (!profile || !season) return;
    try {
      setError(null);
      const res = await fetch('/api/post-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonNumber: season.season_number,
          hostUserId: profile.id,
          doc: currentDoc,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create session');
      const newSessionId = json.sessionId;
      const writeKey = json.writeKey;
      const newSessionCode = json.sessionCode;

      localStorage.setItem(`apex:session:${newSessionId}:writeKey`, writeKey);
      setSessionId(newSessionId);
      setSessionCode(newSessionCode);
      setIsHost(true);

      // Copy the code to clipboard
      const ok = await copyToClipboard(newSessionCode);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      router.push(`/app/in-game-tracker?code=${newSessionCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
    }
  };

  const resetSession = () => {
    setPlayers([
      makeNewPlayer(profile?.id || null, profile?.display_name || ''),
    ]);
    setSessionGames(0);
    setGameHistory([]);
    setWins(0);
    setTotalPlacement(0);
    setPlacements([]);
    setPlacementInput('');
    setSessionId(null);
    setSessionCode(null);
    setShowNewSessionConfirm(false);
    router.push('/app/in-game-tracker');
  };

  const handleCopyLink = async () => {
    if (!sessionCode) return;
    const ok = await copyToClipboard(sessionCode);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyCode = async () => {
    if (!sessionCode) return;
    const ok = await copyToClipboard(sessionCode);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Save session to DB without posting to Discord
  const saveSessionOnly = async () => {
    if (!season) {
      showNotificationModal('Error', 'No active season found', 'error');
      return;
    }

    if (!sessionId) {
      showNotificationModal('Error', 'Please save the session first', 'error');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await fetch('/api/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          postToDiscord: false,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to end session');
      }

      setShowEndSession(false);

      const messages = [
        'Session saved to database ✅',
        '',
        `Stats saved for ${data.statsInserted} player(s)`,
      ];

      if (data.errors && data.errors.length > 0) {
        messages.push('', '⚠️ Warnings:', ...data.errors);
      }

      showNotificationModal(
        data.errors?.length > 0 ? 'Saved with Warnings' : 'Session Saved!',
        messages.join('\n'),
        data.errors?.length > 0 ? 'error' : 'success'
      );

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/app');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save';
      showNotificationModal('Error', message, 'error');
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  // Post to Discord and save all stats
  const postToDiscord = async () => {
    if (!season) {
      showNotificationModal('Error', 'No active season found', 'error');
      return;
    }

    if (!sessionId) {
      showNotificationModal('Error', 'Please save the session first', 'error');
      return;
    }

    try {
      setPosting(true);
      setError(null);

      const res = await fetch('/api/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          postToDiscord: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to end session');
      }

      setShowEndSession(false);

      const messages = [
        data.discordPosted ? 'Posted to Discord ✅' : 'Discord post failed ⚠️',
        '',
        `Stats saved for ${data.statsInserted} player(s)`,
      ];

      if (data.errors && data.errors.length > 0) {
        messages.push('', '⚠️ Warnings:', ...data.errors);
      }

      showNotificationModal(
        data.errors?.length > 0 ? 'Posted with Warnings' : 'Success!',
        messages.join('\n'),
        data.errors?.length > 0 ? 'error' : 'success'
      );

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/app');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post';
      showNotificationModal('Error', message, 'error');
      setError(message);
    } finally {
      setPosting(false);
    }
  };

  const avgPlacement = sessionGames > 0 ? totalPlacement / sessionGames : 0;
  const { groupAvgDamage } = useMemo(() => {
    const withGames = players.filter((p) => p.games > 0);
    if (withGames.length === 0) return { groupAvgDamage: 0 };
    return {
      groupAvgDamage:
        withGames.reduce((acc, p) => acc + p.totalDamage / p.games, 0) /
        withGames.length,
    };
  }, [players]);

  const derived = useMemo(
    () =>
      players.map((p) => ({
        odlId: p.odlId,
        avgDamage: p.games > 0 ? p.totalDamage / p.games : 0,
      })),
    [players]
  );

  const availableProfiles = useMemo(() => {
    const currentPlayerIds = players
      .map((p) => p.odlierId)
      .filter((id): id is string => id !== null);
    return allProfiles.filter(
      (p) =>
        !currentPlayerIds.includes(p.id) && !selectedPlayerIds.includes(p.id)
    );
  }, [allProfiles, players, selectedPlayerIds]);

  const selectedProfiles = useMemo(() => {
    return selectedPlayerIds
      .map((id) => allProfiles.find((p) => p.id === id))
      .filter((p): p is Profile => p !== undefined);
  }, [selectedPlayerIds, allProfiles]);

  const primaryButton = 'btn-primary';
  const secondaryButton = 'btn-secondary';
  const successButton =
    'inline-flex items-center justify-center rounded-xl border border-green-600 bg-green-600 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-green-700 hover:border-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const inputClass = 'input';

  if (loading)
    return (
      <main className="min-h-screen bg-primary text-primary px-4 py-10 grid place-items-center">
        <div className="text-sm text-secondary">Loading…</div>
      </main>
    );
  if (!profile)
    return (
      <main className="min-h-screen bg-primary text-primary px-4 py-10 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Not signed in</div>
          <p className="text-sm text-secondary mb-4">
            Please sign in to use the tracker.
          </p>
          <button onClick={() => router.push('/')} className={secondaryButton}>
            Go Home
          </button>
        </div>
      </main>
    );
  if (!season)
    return (
      <main className="min-h-screen bg-primary text-primary px-4 py-10 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">No active season</div>
          <p className="text-sm text-secondary mb-4">
            Set a season first to start tracking.
          </p>
          <button onClick={() => router.push('/')} className={secondaryButton}>
            Go Home
          </button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-primary text-primary px-4 py-8">
      <ConfirmModal
        isOpen={showNewSessionConfirm}
        title="Start a new session?"
        message="This will reset all current stats and start fresh. Are you sure?"
        confirmText="Yes, Reset"
        cancelText="No"
        onConfirm={resetSession}
        onCancel={() => setShowNewSessionConfirm(false)}
        variant="danger"
      />

      {/* End Session Modal */}
      {showEndSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-themed shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-themed">
              <h2 className="text-lg font-bold text-white">End Session</h2>
              <button
                onClick={() => setShowEndSession(false)}
                className="w-8 h-8 rounded-lg bg-card-hover hover:bg-tertiary flex items-center justify-center text-secondary hover:text-white transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="text-sm text-secondary mb-6">
                Choose how you want to end this session. Your stats will be
                saved either way.
              </p>

              <div className="space-y-3">
                {/* Post to Discord Option */}
                <button
                  onClick={postToDiscord}
                  disabled={posting || saving}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/30 hover:bg-[#5865F2]/20 hover:border-[#5865F2]/50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#5865F2] flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white group-hover:text-[#5865F2] transition-colors">
                      {posting ? 'Posting...' : 'Post to Discord'}
                    </div>
                    <div className="text-xs text-tertiary">
                      Share results with your squad and save to database
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-tertiary group-hover:text-[#5865F2] transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                {/* Save Session Only Option */}
                <button
                  onClick={saveSessionOnly}
                  disabled={posting || saving}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-card-hover border border-themed hover:bg-card-hover hover:border-themed transition-all group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-tertiary flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-6 h-6 text-secondary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-primary group-hover:text-white transition-colors">
                      {saving ? 'Saving...' : 'Save Session Only'}
                    </div>
                    <div className="text-xs text-tertiary">
                      Save stats to database without posting
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-tertiary group-hover:text-slate-300 transition-colors"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                onClick={() => setShowEndSession(false)}
                className="w-full py-2.5 text-sm text-tertiary hover:text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <ConfirmModal
        isOpen={showNotification}
        title={notificationTitle}
        message={notificationMessage}
        confirmText="OK"
        onConfirm={() => setShowNotification(false)}
        onCancel={() => setShowNotification(false)}
        variant={notificationType === 'error' ? 'danger' : 'default'}
      />

      <div className="page-container py-6">
        {/* Session Code Banner */}
        {sessionCode && (
          <div className="session-code-banner rounded-2xl p-4 flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-accent"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                  />
                </svg>
              </div>
              <div>
                <div className="text-[10px] text-tertiary uppercase tracking-[0.2em] mb-1">
                  Session Code
                </div>
                <div className="text-2xl font-bold tracking-[0.15em] text-accent font-mono">
                  {sessionCode}
                </div>
              </div>
            </div>

            <button
              onClick={handleCopyCode}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                copied
                  ? 'bg-green-500 text-white'
                  : 'bg-accent/10 text-accent border border-accent/50 hover:bg-accent hover:text-white'
              }`}
            >
              {copied ? (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy Code
                </>
              )}
            </button>
          </div>
        )}

        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-primary">
              <span className="mr-2 inline-block border-l-4 border-accent pl-2 uppercase text-xs tracking-[0.2em] text-secondary">
                Season {season.season_number} • {isHost ? 'Host' : 'Player'}
              </span>
              <span className="block text-2xl sm:text-3xl text-accent">
                Trio Session Tracker
              </span>
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-secondary">
              {isHost ? (
                <>
                  Enter stats and hit{' '}
                  <span className="font-semibold text-primary">Add Game</span>.
                  Players can update their own RP.
                </>
              ) : (
                <>
                  Viewing live session. You can only update{' '}
                  <span className="font-semibold text-primary">
                    your own RP
                  </span>
                  .
                </>
              )}
            </p>
            {/* NEW: Last Refreshed Indicator */}
            {lastRefreshed && !isHost && (
              <p className="mt-1 text-xs text-tertiary">
                Last updated: {lastRefreshed.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* NEW: Refresh Button for non-hosts */}
            {!isHost && sessionId && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className={secondaryButton}
              >
                {refreshing ? '🔄 Refreshing...' : '🔄 Refresh Tracker'}
              </button>
            )}
            {isHost && (
              <>
                <button
                  onClick={() => setShowAddPlayer(true)}
                  disabled={players.length >= MAX_PLAYERS}
                  className={secondaryButton}
                >
                  + Add Player
                </button>
                <button
                  onClick={() => setShowNewSessionConfirm(true)}
                  className={secondaryButton}
                >
                  New Session
                </button>
              </>
            )}
            {!sessionCode && (
              <button onClick={createSession} className={primaryButton}>
                Start Session
              </button>
            )}
            <button
              onClick={() => router.push('/app')}
              className={secondaryButton}
            >
              Home
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {showAddPlayer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-3xl rounded-lg bg-card border border-themed shadow-lg">
              <div className="p-6 border-b border-themed">
                <h2 className="text-lg font-semibold text-white">
                  Add Players to Session
                </h2>
                <p className="text-xs text-secondary mt-1">
                  Select registered players to add to this session
                </p>
              </div>

              <div className="p-6">
                {modalError && (
                  <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {modalError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">
                      Available Players
                    </h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {availableProfiles.length === 0 ? (
                        <div className="text-xs text-tertiary text-center py-8">
                          No more players available
                        </div>
                      ) : (
                        availableProfiles.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-secondary border border-themed hover:border-accent/50 transition"
                          >
                            <span className="text-sm text-primary">
                              {player.display_name}
                            </span>
                            <button
                              onClick={() => addToSelection(player.id)}
                              disabled={
                                selectedPlayerIds.length + players.length >=
                                MAX_PLAYERS
                              }
                              className="w-7 h-7 rounded-lg bg-accent hover:bg-accent-dark text-white flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Add player"
                            >
                              <span className="text-lg leading-none">+</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-300 mb-3">
                      Selected Players ({selectedProfiles.length})
                    </h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {selectedProfiles.length === 0 ? (
                        <div className="text-xs text-tertiary text-center py-8">
                          No players selected yet
                        </div>
                      ) : (
                        selectedProfiles.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-card-hover border border-accent/30"
                          >
                            <span className="text-sm text-primary">
                              {player.display_name}
                            </span>
                            <button
                              onClick={() => removeFromSelection(player.id)}
                              className="w-7 h-7 rounded-lg bg-tertiary hover:bg-red-600/20 text-secondary hover:text-red-400 flex items-center justify-center transition"
                              title="Remove player"
                            >
                              <span className="text-lg leading-none">−</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-themed flex justify-end gap-3">
                <button onClick={cancelAddPlayers} className={secondaryButton}>
                  Cancel
                </button>
                <button
                  onClick={confirmAddPlayers}
                  disabled={selectedProfiles.length === 0}
                  className={primaryButton}
                >
                  Add{' '}
                  {selectedProfiles.length > 0
                    ? `${selectedProfiles.length} `
                    : ''}
                  Player{selectedProfiles.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-themed bg-card p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-tertiary">
              Games
            </div>
            <div className="text-xl font-semibold text-primary">
              {sessionGames}
            </div>
          </div>
          <div className="rounded-2xl border border-themed bg-card p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-tertiary">
              Wins
            </div>
            <div className="text-xl font-semibold text-amber-400">{wins}</div>
          </div>
          <div className="rounded-2xl border border-themed bg-card p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-tertiary">
              Avg Placement
            </div>
            <div className="text-xl font-semibold text-primary">
              {avgPlacement.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-themed bg-gradient-to-br from-secondary via-card to-accent/20 p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
              Squad RP
            </div>
            <div className="text-xl font-semibold text-accent">
              {players.reduce((acc, p) => acc + p.totalRP, 0)}
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-themed bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-xs sm:text-sm font-semibold text-primary flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-accent" />
            Data Entry
          </h2>
          <div className="grid gap-3">
            {players.map((p, idx) => (
              <div
                key={p.odlId}
                className="grid grid-cols-1 items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 sm:grid-cols-12"
              >
                <div className="text-xs font-semibold text-tertiary sm:col-span-1">
                  #{idx + 1}
                </div>
                <div className="sm:col-span-3">
                  <div className="w-full rounded-xl border border-themed bg-primary px-3 py-2 text-sm text-primary">
                    {p.name || '(no name)'}
                  </div>
                </div>
                <div className="sm:col-span-3">
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={p.damageInput}
                    onChange={(e) =>
                      updateField(p.odlId, 'damageInput', e.target.value)
                    }
                    placeholder="Damage (e.g. 1200)"
                    disabled={!isHost}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-3">
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={p.killsInput}
                    onChange={(e) =>
                      updateField(p.odlId, 'killsInput', e.target.value)
                    }
                    placeholder="Kills (e.g. 3)"
                    disabled={!isHost}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  {isHost && players.length > 1 && (
                    <button
                      onClick={() => removePlayer(p.odlId)}
                      className="w-full rounded-xl border border-themed bg-secondary px-2 py-2 text-xs text-slate-300 hover:border-accent hover:bg-card-hover hover:text-white shadow-sm cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary">Placement:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={placementInput}
                onChange={(e) => setPlacementInput(e.target.value)}
                placeholder="1-20"
                disabled={!isHost}
                className="w-20 rounded-xl border border-themed bg-primary px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
              />
            </div>
            <button
              onClick={addGameAll}
              disabled={!isHost}
              className={primaryButton}
            >
              Add Game ▶
            </button>
            <button
              onClick={undoGameAll}
              disabled={!isHost || gameHistory.length === 0}
              className={secondaryButton}
            >
              ◀ Undo Last Game
            </button>
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-themed bg-card p-4 shadow-sm">
          <h2 className="mb-3 text-xs sm:text-sm font-semibold text-primary flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-accent" />
            Player RP
            <span className="ml-2 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-medium uppercase tracking-wider">
              Live
            </span>
          </h2>
          <p className="text-[11px] text-tertiary mb-3">
            Each player tracks their own RP. Enter RP change per match (can be
            negative). Updates sync in realtime.
          </p>
          <div className="grid gap-3">
            {players.map((p, idx) => {
              const isMe = p.odlierId === profile.id;
              const canEdit = isHost || isMe;
              return (
                <div
                  key={p.odlId}
                  className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 ${isMe ? 'bg-card-hover border border-accent/30' : 'bg-secondary/60'}`}
                >
                  <div className="text-xs font-semibold text-tertiary w-6">
                    #{idx + 1}
                  </div>
                  <div className="text-sm text-primary min-w-[100px]">
                    {p.name || '(no name)'}
                    {isMe && (
                      <span className="ml-2 text-xs text-accent">(You)</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-accent min-w-[80px]">
                    RP: {p.totalRP > 0 ? '+' : ''}
                    {p.totalRP}
                  </div>
                  <input
                    type="number"
                    value={p.rpInput}
                    onChange={(e) =>
                      updateField(p.odlId, 'rpInput', e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRP(p.odlId);
                    }}
                    placeholder="e.g. 45 or -23"
                    disabled={!canEdit}
                    className="w-32 rounded-xl border border-themed bg-primary px-3 py-2 text-sm text-primary outline-none placeholder:text-tertiary focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
                  />
                  <button
                    onClick={() => commitRP(p.odlId)}
                    disabled={!canEdit || savingRP === p.odlId}
                    className={`${primaryButton} py-2`}
                  >
                    {savingRP === p.odlId ? 'Saving...' : 'Add RP'}
                  </button>
                  <button
                    onClick={() => undoRP(p.odlId)}
                    disabled={!canEdit || p.rpHistory.length === 0}
                    className={`${secondaryButton} py-2`}
                  >
                    Undo
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="overflow-x-auto rounded-2xl border border-themed bg-card shadow-sm">
          <div className="px-4 py-3 border-b border-themed flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-accent" />
            <span className="text-xs sm:text-sm font-semibold text-primary">
              Session Stats
            </span>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-medium uppercase tracking-wider">
              Live
            </span>
          </div>
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-secondary text-slate-300 border-b border-themed">
              <tr>
                <th className="px-4 py-3 w-[44px] text-[11px] uppercase tracking-[0.16em]">
                  #
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Name
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Total Damage
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Total Kills
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  1k Games
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  2k Games
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Avg Damage
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Donuts
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  RP
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, idx) => {
                const avgs = derived.find((d) => d.odlId === p.odlId)!;
                return (
                  <tr
                    key={p.odlId}
                    className="border-t border-themed odd:bg-primary even:bg-card hover:bg-card-hover transition-colors"
                  >
                    <td className="px-4 py-3 text-tertiary">{idx + 1}</td>
                    <td className="px-4 py-3 text-primary">{p.name || '—'}</td>
                    <td className="px-4 py-3 text-primary">
                      {p.totalDamage.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-primary">{p.totalKills}</td>
                    <td className="px-4 py-3 text-primary">{p.oneKGames}</td>
                    <td className="px-4 py-3 text-primary">{p.twoKGames}</td>
                    <td className="px-4 py-3 text-primary">
                      {avgs.avgDamage.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-primary">{p.donuts}</td>
                    <td className="px-4 py-3 text-accent font-semibold">
                      {p.totalRP > 0 ? '+' : ''}
                      {p.totalRP}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-themed bg-secondary font-semibold text-primary">
                <td className="px-4 py-3 text-tertiary">—</td>
                <td className="px-4 py-3 text-slate-300">Totals</td>
                <td className="px-4 py-3">
                  {players
                    .reduce((acc, p) => acc + p.totalDamage, 0)
                    .toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {players.reduce((acc, p) => acc + p.totalKills, 0)}
                </td>
                <td className="px-4 py-3">
                  {players.reduce((acc, p) => acc + p.oneKGames, 0)}
                </td>
                <td className="px-4 py-3">
                  {players.reduce((acc, p) => acc + p.twoKGames, 0)}
                </td>
                <td className="px-4 py-3">{groupAvgDamage.toFixed(0)}</td>
                <td className="px-4 py-3">
                  {players.reduce((acc, p) => acc + p.donuts, 0)}
                </td>
                <td className="px-4 py-3 text-accent">
                  {players.reduce((acc, p) => acc + p.totalRP, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isHost && (
            <button
              onClick={() => setShowEndSession(true)}
              className={successButton}
            >
              End Session
            </button>
          )}
          <button
            onClick={() => router.push('/app/season-progression')}
            className={secondaryButton}
          >
            View Season Progression
          </button>
        </div>
      </div>
    </main>
  );
}

export default function InGameTrackerPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-primary text-primary px-4 py-10 grid place-items-center">
          <div className="text-sm text-secondary">Loading…</div>
        </main>
      }
    >
      <InGameTrackerContent />
    </Suspense>
  );
}
