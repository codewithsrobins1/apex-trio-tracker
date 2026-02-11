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
  const sessionIdFromUrl = searchParams.get('s');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  const [sessionId, setSessionId] = useState<string | null>(sessionIdFromUrl);
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
  const [showPostConfirm, setShowPostConfirm] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  
  // NEW: Notification modal state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationType, setNotificationType] = useState<'success' | 'error' | 'info'>('info');
  
  // NEW: Refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const autoRefreshInterval = useRef<NodeJS.Timeout | null>(null);
  
  // NEW: Saving RP state
  const [savingRP, setSavingRP] = useState<string | null>(null); // odlId of player being saved

  const MAX_PLAYERS = 3;

  // Helper to show notification modal
  const showNotificationModal = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotificationTitle(title);
    setNotificationMessage(message);
    setNotificationType(type);
    setShowNotification(true);
  };

  // Helper to save full state to localStorage
  const saveToLocalStorage = useCallback((sessionId: string, doc: SessionDoc) => {
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
  }, []);

  // Helper to load from localStorage
  const loadFromLocalStorage = useCallback((sessionId: string): SessionDoc | null => {
    try {
      const stored = localStorage.getItem(`apex:session:${sessionId}:fullState`);
      if (!stored) return null;
      return JSON.parse(stored);
    } catch (err) {
      console.error('Failed to load from localStorage:', err);
      return null;
    }
  }, []);

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

      if (sessionIdFromUrl) {
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionIdFromUrl)
          .maybeSingle();

        if (sessionError) throw sessionError;

        if (sessionData) {
          const doc = sessionData.doc as SessionDoc;
          const writeKey = localStorage.getItem(
            `apex:session:${sessionIdFromUrl}:writeKey`
          );
          const isHostUser = writeKey === sessionData.write_key;

          setIsHost(isHostUser);
          setSessionId(sessionIdFromUrl);

          // Try to load from localStorage first
          const localData = loadFromLocalStorage(sessionIdFromUrl);
          
          // Use database data but merge with localStorage if available and newer
          const finalDoc = localData && localData.lastUpdated && new Date(localData.lastUpdated) > new Date(sessionData.updated_at)
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
        }
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
  }, [sessionIdFromUrl, makeNewPlayer, loadFromLocalStorage]);

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
      showNotificationModal('Refresh Failed', 'Could not fetch latest data', 'error');
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
          const myCurrentPlayer = players.find(
            (p) => p.odlierId === profile?.id
          );

          setPlayers(
            doc.players.map((p) => {
              const isMe = p.odlierId === profile?.id;
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
                totalRP:
                  isMe && myCurrentPlayer ? myCurrentPlayer.totalRP : p.totalRP,
                rpInput: isMe && myCurrentPlayer ? myCurrentPlayer.rpInput : '',
                rpHistory:
                  isMe && myCurrentPlayer ? myCurrentPlayer.rpHistory : [],
              };
            })
          );
          setSessionGames(doc.sessionGames);
          setWins(doc.wins);
          setTotalPlacement(doc.totalPlacement);
          setPlacements(doc.placements || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, isHost, profile?.id, makeNewPlayer, players]);

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
            p.odlId === odlId
              ? { ...p, totalRP: newTotalRP }
              : p
          ),
        };

        // Get writeKey (only host has this)
        const writeKey = localStorage.getItem(`apex:session:${sessionId}:writeKey`);
        
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
        
        console.log(`✅ RP saved: ${player.name} +${delta} (Total: ${newTotalRP})`);
      } catch (err) {
        console.error('Failed to save RP to database:', err);
        showNotificationModal('Error', `Failed to save RP: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
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
      localStorage.setItem(`apex:session:${newSessionId}:writeKey`, writeKey);
      setSessionId(newSessionId);
      setIsHost(true);
      const url = `${window.location.origin}/in-game-tracker?s=${newSessionId}`;
      const ok = await copyToClipboard(url);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      router.push(`/in-game-tracker?s=${newSessionId}`);
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
    setShowNewSessionConfirm(false);
    router.push('/in-game-tracker');
  };

  const handleCopyLink = async () => {
    if (!sessionId) return;
    const url = `${window.location.origin}/in-game-tracker?s=${sessionId}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // UPDATED: postToDiscord with fresh data fetch and proper RP accumulation
  const postToDiscord = async () => {
    if (!season || !sessionId) return;
    try {
      setPosting(true);
      setError(null);
      
      // STEP 1: Fetch fresh session data from database
      const { data: freshSessionData, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!freshSessionData) throw new Error('Session not found');

      const freshDoc = freshSessionData.doc as SessionDoc;
      
      // Use fresh data for Discord post
      const avgPlacement =
        freshDoc.sessionGames > 0 ? (freshDoc.totalPlacement / freshDoc.sessionGames).toFixed(1) : '0';
      const lines: string[] = [
        `**Apex Session Summary — Season ${season.season_number}**`,
        `Games: ${freshDoc.sessionGames} | Wins: ${freshDoc.wins} | Avg Placement: ${avgPlacement}`,
        '',
      ];
      
      freshDoc.players.forEach((p, i) => {
        const avgDmg = p.games > 0 ? (p.totalDamage / p.games).toFixed(0) : '0';
        lines.push(`**#${i + 1} ${p.name || '(no name)'}**`);
        lines.push(
          `• Damage: ${p.totalDamage.toLocaleString()} (Avg: ${avgDmg})`
        );
        lines.push(`• Kills: ${p.totalKills}`);
        lines.push(`• 1k Games: ${p.oneKGames} | 2k Games: ${p.twoKGames}`);
        lines.push(`• Donuts: ${p.donuts}`);
        lines.push(`• Session RP: ${p.totalRP > 0 ? '+' : ''}${p.totalRP}`);
        lines.push('');
      });
      
      const totalSquadRP = freshDoc.players.reduce((acc, p) => acc + p.totalRP, 0);
      lines.push(
        `**Squad Total RP: ${totalSquadRP > 0 ? '+' : ''}${totalSquadRP}**`
      );

      // STEP 2: Post to Discord
      const res = await fetch('/api/discord', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { content: lines.join('\n') } }),
      });
      if (!res.ok)
        throw new Error((await res.text()) || 'Failed to post to Discord');

      // STEP 3: Save RP to graph (with accumulation for same day)
      const today = new Date().toISOString().split('T')[0];
      const successMessages: string[] = [];
      const errorMessages: string[] = [];

      for (const player of freshDoc.players) {
        if (!player.odlierId) continue; // Skip unregistered players (no odlierId)

        // STEP 3A: Auto-register player to season if not already registered
        const { data: existingSeasonPlayer, error: checkError } = await supabase
          .from('season_players')
          .select('id')
          .eq('season_id', season.id)
          .eq('user_id', player.odlierId)
          .maybeSingle();

        if (checkError) {
          console.error(`Failed to check registration for ${player.name}:`, checkError);
          errorMessages.push(`Failed to check registration for ${player.name}`);
          continue;
        }

        if (!existingSeasonPlayer) {
          // Player not registered yet, register them
          const { error: registerError } = await supabase
            .from('season_players')
            .insert({
              season_id: season.id,
              user_id: player.odlierId,
            });

          if (registerError) {
            // Check if it's a duplicate key error (23505 = unique violation)
            if (registerError.code === '23505') {
              console.log(`ℹ️ ${player.name} already registered to Season ${season.season_number}`);
              // Don't add to error messages - this is fine, just means they're already registered
            } else {
              console.error(`Failed to register ${player.name} to season:`, registerError);
              errorMessages.push(`Failed to register ${player.name}: ${registerError.message}`);
              continue; // Skip RP save if registration failed
            }
          } else {
            console.log(`✅ Auto-registered ${player.name} to Season ${season.season_number}`);
          }
        } else {
          console.log(`ℹ️ ${player.name} already registered to Season ${season.season_number}`);
        }

        // STEP 3B: Save RP (skip if RP is 0)
        if (player.totalRP === 0) {
          successMessages.push(`${player.name}: Registered (no RP this session)`);
          continue;
        }

        // Check if entry exists for today
        const { data: existing } = await supabase
          .from('season_rp_entries')
          .select('id, delta_rp')
          .eq('season_id', season.id)
          .eq('user_id', player.odlierId)
          .eq('entry_date', today)
          .maybeSingle();

        if (existing) {
          // UPDATE: Add to existing RP
          const newDeltaRP = existing.delta_rp + player.totalRP;
          const { error: updateError } = await supabase
            .from('season_rp_entries')
            .update({ delta_rp: newDeltaRP })
            .eq('id', existing.id);

          if (updateError) {
            console.error(`Failed to update RP for ${player.name}:`, updateError);
            errorMessages.push(`Failed to update ${player.name}`);
          } else {
            successMessages.push(`${player.name}: ${player.totalRP >= 0 ? '+' : ''}${player.totalRP} RP (Total today: ${newDeltaRP >= 0 ? '+' : ''}${newDeltaRP})`);
          }
        } else {
          // INSERT: Create new entry
          const { error: insertError } = await supabase
            .from('season_rp_entries')
            .insert({
              season_id: season.id,
              user_id: player.odlierId,
              delta_rp: player.totalRP,
              entry_date: today,
            });

          if (insertError) {
            console.error(`Failed to save RP for ${player.name}:`, insertError);
            errorMessages.push(`Failed to save ${player.name}`);
          } else {
            successMessages.push(`${player.name}: ${player.totalRP >= 0 ? '+' : ''}${player.totalRP} RP`);
          }
        }
      }

      setShowPostConfirm(false);

      // Show in-app notification
      const title = errorMessages.length > 0 ? 'Posted with Warnings' : 'Success!';
      const message = [
        'Posted to Discord ✅',
        '',
        ...successMessages,
        ...(errorMessages.length > 0 ? ['', '⚠️ Errors:', ...errorMessages] : [])
      ].join('\n');
      
      showNotificationModal(title, message, errorMessages.length > 0 ? 'error' : 'success');
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
    const currentPlayerIds = players.map((p) => p.odlierId).filter((id): id is string => id !== null);
    return allProfiles.filter(
      (p) => !currentPlayerIds.includes(p.id) && !selectedPlayerIds.includes(p.id)
    );
  }, [allProfiles, players, selectedPlayerIds]);

  const selectedProfiles = useMemo(() => {
    return selectedPlayerIds
      .map((id) => allProfiles.find((p) => p.id === id))
      .filter((p): p is Profile => p !== undefined);
  }, [selectedPlayerIds, allProfiles]);

  const primaryButton =
    'inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const secondaryButton =
    'inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-2 text-xs sm:text-sm font-medium text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const successButton =
    'inline-flex items-center justify-center rounded-xl border border-green-600 bg-green-600 px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-green-700 hover:border-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const inputClass =
    'w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-50 disabled:cursor-not-allowed';

  if (loading)
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-sm text-slate-400">Loading…</div>
      </main>
    );
  if (!profile)
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">Not signed in</div>
          <p className="text-sm text-slate-400 mb-4">
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
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-center">
          <div className="text-lg font-semibold mb-2">No active season</div>
          <p className="text-sm text-slate-400 mb-4">
            Set a season first to start tracking.
          </p>
          <button onClick={() => router.push('/')} className={secondaryButton}>
            Go Home
          </button>
        </div>
      </main>
    );

  return (
    <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-8">
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
      <ConfirmModal
        isOpen={showPostConfirm}
        title="Post to Discord?"
        message="This will post the session stats to Discord and save everyone's RP to the season progression graph."
        confirmText={posting ? 'Posting…' : 'Yes, Post'}
        cancelText="Cancel"
        onConfirm={postToDiscord}
        onCancel={() => setShowPostConfirm(false)}
      />
      
      {/* NEW: Notification Modal */}
      <ConfirmModal
        isOpen={showNotification}
        title={notificationTitle}
        message={notificationMessage}
        confirmText="OK"
        onConfirm={() => setShowNotification(false)}
        onCancel={() => setShowNotification(false)}
        variant={notificationType === 'error' ? 'danger' : 'default'}
      />

      <div className="mx-auto max-w-[1300px]">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#F5F5F5]">
              <span className="mr-2 inline-block border-l-4 border-[#E03A3E] pl-2 uppercase text-xs tracking-[0.2em] text-slate-400">
                Season {season.season_number} • {isHost ? 'Host' : 'Player'}
              </span>
              <span className="block text-2xl sm:text-3xl text-[#E03A3E]">
                Trio Session Tracker
              </span>
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-400">
              {isHost ? (
                <>
                  Enter stats and hit{' '}
                  <span className="font-semibold text-slate-200">Add Game</span>
                  . Players can update their own RP.
                </>
              ) : (
                <>
                  Viewing live session. You can only update{' '}
                  <span className="font-semibold text-slate-200">
                    your own RP
                  </span>
                  .
                </>
              )}
            </p>
            {/* NEW: Last Refreshed Indicator */}
            {lastRefreshed && !isHost && (
              <p className="mt-1 text-xs text-slate-500">
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
            {sessionId ? (
              <button onClick={handleCopyLink} className={primaryButton}>
                {copied ? 'Copied!' : 'Share Live Link'}
              </button>
            ) : (
              <button onClick={createSession} className={primaryButton}>
                Share Live Link
              </button>
            )}
            <button
              onClick={() => router.push('/')}
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
            <div className="w-full max-w-3xl rounded-lg bg-[#121418] border border-[#2A2E32] shadow-lg">
              <div className="p-6 border-b border-[#2A2E32]">
                <h2 className="text-lg font-semibold text-white">
                  Add Players to Session
                </h2>
                <p className="text-xs text-slate-400 mt-1">
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
                        <div className="text-xs text-slate-500 text-center py-8">
                          No more players available
                        </div>
                      ) : (
                        availableProfiles.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-[#181B1F] border border-[#2A2E32] hover:border-[#E03A3E]/50 transition"
                          >
                            <span className="text-sm text-slate-200">
                              {player.display_name}
                            </span>
                            <button
                              onClick={() => addToSelection(player.id)}
                              disabled={selectedPlayerIds.length + players.length >= MAX_PLAYERS}
                              className="w-7 h-7 rounded-lg bg-[#E03A3E] hover:bg-[#B71C1C] text-white flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
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
                        <div className="text-xs text-slate-500 text-center py-8">
                          No players selected yet
                        </div>
                      ) : (
                        selectedProfiles.map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-[#1F2228] border border-[#E03A3E]/30"
                          >
                            <span className="text-sm text-slate-200">
                              {player.display_name}
                            </span>
                            <button
                              onClick={() => removeFromSelection(player.id)}
                              className="w-7 h-7 rounded-lg bg-[#2A2E32] hover:bg-red-600/20 text-slate-400 hover:text-red-400 flex items-center justify-center transition"
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

              <div className="p-6 border-t border-[#2A2E32] flex justify-end gap-3">
                <button onClick={cancelAddPlayers} className={secondaryButton}>
                  Cancel
                </button>
                <button
                  onClick={confirmAddPlayers}
                  disabled={selectedProfiles.length === 0}
                  className={primaryButton}
                >
                  Add {selectedProfiles.length > 0 ? `${selectedProfiles.length} ` : ''}Player{selectedProfiles.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Games
            </div>
            <div className="text-xl font-semibold text-slate-100">
              {sessionGames}
            </div>
          </div>
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Wins
            </div>
            <div className="text-xl font-semibold text-[#C9A86A]">{wins}</div>
          </div>
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Avg Placement
            </div>
            <div className="text-xl font-semibold text-slate-100">
              {avgPlacement.toFixed(1)}
            </div>
          </div>
          <div className="rounded-2xl border border-[#2A2E32] bg-gradient-to-br from-[#181B1F] via-[#1F2228] to-[#3A0F13] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Squad RP
            </div>
            <div className="text-xl font-semibold text-[#E03A3E]">
              {players.reduce((acc, p) => acc + p.totalRP, 0)}
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
          <h2 className="mb-3 text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-[#E03A3E]" />
            Data Entry
          </h2>
          <div className="grid gap-3">
            {players.map((p, idx) => (
              <div
                key={p.odlId}
                className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[#181B1F]/60 px-3 py-2 sm:grid-cols-12"
              >
                <div className="text-xs font-semibold text-slate-500 sm:col-span-1">
                  #{idx + 1}
                </div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) =>
                      updateField(p.odlId, 'name', e.target.value)
                    }
                    placeholder="Player name"
                    disabled={!isHost}
                    className={inputClass}
                  />
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
                      className="w-full rounded-xl border border-[#2A2E32] bg-[#181B1F] px-2 py-2 text-xs text-slate-300 hover:border-[#E03A3E] hover:bg-[#20242A] hover:text-white shadow-sm cursor-pointer"
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
              <span className="text-xs text-slate-400">Placement:</span>
              <input
                type="number"
                min={1}
                max={20}
                value={placementInput}
                onChange={(e) => setPlacementInput(e.target.value)}
                placeholder="1-20"
                disabled={!isHost}
                className="w-20 rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-50"
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

        <section className="mb-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
          <h2 className="mb-3 text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-[#E03A3E]" />
            Player RP
          </h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Each player tracks their own RP. Enter RP change per match (can be
            negative). Updates save immediately.
          </p>
          <div className="grid gap-3">
            {players.map((p, idx) => {
              const isMe = p.odlierId === profile.id;
              const canEdit = isHost || isMe;
              return (
                <div
                  key={p.odlId}
                  className={`flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 ${isMe ? 'bg-[#1F2228] border border-[#E03A3E]/30' : 'bg-[#181B1F]/60'}`}
                >
                  <div className="text-xs font-semibold text-slate-500 w-6">
                    #{idx + 1}
                  </div>
                  <div className="text-sm text-slate-200 min-w-[100px]">
                    {p.name || '(no name)'}
                    {isMe && (
                      <span className="ml-2 text-xs text-[#E03A3E]">(You)</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-[#E03A3E] min-w-[80px]">
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
                    className="w-32 rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-50"
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

        <div className="overflow-x-auto rounded-2xl border border-[#2A2E32] bg-[#121418] shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#181B1F] text-slate-300 border-b border-[#2A2E32]">
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
                    className="border-t border-[#1D2026] odd:bg-[#101319] even:bg-[#121418] hover:bg-[#181B23] transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-slate-100">
                      {p.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-200">
                      {p.totalDamage.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{p.totalKills}</td>
                    <td className="px-4 py-3 text-slate-200">{p.oneKGames}</td>
                    <td className="px-4 py-3 text-slate-200">{p.twoKGames}</td>
                    <td className="px-4 py-3 text-slate-200">
                      {avgs.avgDamage.toFixed(0)}
                    </td>
                    <td className="px-4 py-3 text-slate-200">{p.donuts}</td>
                    <td className="px-4 py-3 text-[#E03A3E] font-semibold">
                      {p.totalRP > 0 ? '+' : ''}
                      {p.totalRP}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#2A2E32] bg-[#181B1F] font-semibold text-slate-100">
                <td className="px-4 py-3 text-slate-500">—</td>
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
                <td className="px-4 py-3 text-[#E03A3E]">
                  {players.reduce((acc, p) => acc + p.totalRP, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isHost && (
            <button
              onClick={() => setShowPostConfirm(true)}
              className={successButton}
            >
              Post Session to Discord
            </button>
          )}
          <button
            onClick={() => router.push('/season-progression')}
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
        <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
          <div className="text-sm text-slate-400">Loading…</div>
        </main>
      }
    >
      <InGameTrackerContent />
    </Suspense>
  );
}
