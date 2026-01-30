/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { copyToClipboard } from "@/helpers/copyToClipboard";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchMyProfile, type Profile } from "@/lib/auth/usernameAuth";

type Season = {
  id: string;
  host_user_id: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
};

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ApexTrioTracker() {
  // ===== Types =====
  type GameEntry = { damage: number; kills: number };
  type Player = {
    id: string;
    name: string;
    damageInput: string;
    killsInput: string;
    games: number; // increments with global Add Game
    totalDamage: number;
    totalKills: number;
    oneKGames: number; // damage >= 1000
    twoKGames: number; // damage >= 2000
    donuts: number; // damage == 0 AND kills == 0
    history: GameEntry[];
  };
  type GameFrame = { entries: { id: string; entry: GameEntry }[] };

  // ===== Helpers =====
  const makeNewPlayer = (): Player => ({
    id: crypto.randomUUID(),
    name: "",
    damageInput: "",
    killsInput: "",
    games: 0,
    totalDamage: 0,
    totalKills: 0,
    oneKGames: 0,
    twoKGames: 0,
    donuts: 0,
    history: [],
  });

  // ===== Auth / Season gating =====
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [bootLoading, setBootLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setBootErr(null);

        const p = await fetchMyProfile();
        if (!mounted) return;
        setProfile(p);

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        const uid = sessionData.session?.user?.id ?? null;
        if (!uid) throw new Error("Not signed in. Go back to Home and enter a username.");
        setAuthUserId(uid);

        const { data: s, error: seasonErr } = await supabase
          .from("seasons")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (seasonErr) throw seasonErr;
        if (!s) throw new Error("No active season found. Create one in Supabase.");
        setSeason(s as Season);

        const host = (s as Season).host_user_id === uid;
        setIsHost(host);

        const { data: memberRow, error: memberErr } = await supabase
          .from("season_players")
          .select("season_id,user_id")
          .eq("season_id", (s as Season).id)
          .eq("user_id", uid)
          .maybeSingle();

        if (memberErr) throw memberErr;
        setIsMember(!!memberRow);
      } catch (e: any) {
        if (mounted) setBootErr(e?.message ?? "Failed to initialize tracker");
      } finally {
        if (mounted) setBootLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ===== State =====
  const [players, setPlayers] = useState<Player[]>([makeNewPlayer()]);
  const [sessionGames, setSessionGames] = useState<number>(0);
  const [gameHistory, setGameHistory] = useState<GameFrame[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // RP (self-only; persists to rp_entries)
  const [rpInput, setRpInput] = useState<string>("");
  const [totalRP, setTotalRP] = useState<number>(0); // your season total
  const [rpHistory, setRpHistory] = useState<{ entryId: string; delta: number }[]>([]);
  const [rpEntryDate, setRpEntryDate] = useState<string>(todayISODate());
  const [rpSaving, setRpSaving] = useState(false);
  const [rpErr, setRpErr] = useState<string | null>(null);

  // Wins (host-controlled for now)
  const [wins, setWins] = useState<number>(0);
  const [winsHistory, setWinsHistory] = useState<number[]>([]);

  // Live session id
  const [sessionId, setSessionId] = useState<string | null>(null);

  const MAX_PLAYERS = 3;

  // ===== Player mgmt (HOST ONLY) =====
  const addPlayer = () => {
    if (!isHost) return;
    if (players.length >= MAX_PLAYERS) return;
    setPlayers((p) => [...p, makeNewPlayer()]);
  };
  const removePlayer = (id: string) => {
    if (!isHost) return;
    setPlayers((p) => p.filter((pl) => pl.id !== id));
  };
  const updateField = <K extends keyof Player>(id: string, field: K, value: Player[K]) => {
    setPlayers((prev) => prev.map((pl) => (pl.id === id ? { ...pl, [field]: value } : pl)));
  };

  // ===== Global Add / Undo (HOST ONLY) =====
  const addGameAll = () => {
    if (!isHost) return;

    const anyProvided = players.some((p) => (p.damageInput ?? "") !== "" || (p.killsInput ?? "") !== "");
    if (!anyProvided) return;

    const frame: GameFrame = { entries: [] };

    setPlayers((prev) =>
      prev.map((pl) => {
        const dmgN = Number(pl.damageInput);
        const kN = Number(pl.killsInput);
        const dmg = Number.isFinite(dmgN) && dmgN >= 0 ? dmgN : 0;
        const k = Number.isFinite(kN) && kN >= 0 ? kN : 0;

        frame.entries.push({ id: pl.id, entry: { damage: dmg, kills: k } });

        const isDonut = dmg === 0 && k === 0;

        return {
          ...pl,
          games: pl.games + 1,
          totalDamage: pl.totalDamage + dmg,
          totalKills: pl.totalKills + k,
          oneKGames: pl.oneKGames + (dmg >= 1000 ? 1 : 0),
          twoKGames: pl.twoKGames + (dmg >= 2000 ? 1 : 0),
          donuts: pl.donuts + (isDonut ? 1 : 0),
          damageInput: "",
          killsInput: "",
          history: [...pl.history, { damage: dmg, kills: k }],
        };
      })
    );

    setSessionGames((g) => g + 1);
    setGameHistory((h) => [...h, frame]);
  };

  const undoGameAll = () => {
    if (!isHost) return;
    if (gameHistory.length === 0) return;

    const last = gameHistory[gameHistory.length - 1];

    setPlayers((prev) =>
      prev.map((pl) => {
        const rec = last.entries.find((e) => e.id === pl.id);
        if (!rec) return pl;

        const { damage, kills } = rec.entry;
        const isDonut = damage === 0 && kills === 0;

        return {
          ...pl,
          games: Math.max(0, pl.games - 1),
          totalDamage: Math.max(0, pl.totalDamage - damage),
          totalKills: Math.max(0, pl.totalKills - kills),
          oneKGames: Math.max(0, pl.oneKGames - (damage >= 1000 ? 1 : 0)),
          twoKGames: Math.max(0, pl.twoKGames - (damage >= 2000 ? 1 : 0)),
          donuts: Math.max(0, pl.donuts - (isDonut ? 1 : 0)),
          damageInput: String(damage || ""),
          killsInput: String(kills || ""),
          history: pl.history.slice(0, -1),
        };
      })
    );

    setSessionGames((g) => Math.max(0, g - 1));
    setGameHistory((h) => h.slice(0, -1));
  };

  // ===== RP (SELF ONLY) =====
  const refreshMyRpTotal = useCallback(async () => {
    if (!season?.id || !authUserId) return;

    const { data, error } = await supabase
      .from("rp_entries")
      .select("delta_rp")
      .eq("season_id", season.id)
      .eq("user_id", authUserId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    const sum = (data ?? []).reduce((acc: number, r: any) => acc + (Number(r.delta_rp) || 0), 0);
    setTotalRP(sum);
  }, [season?.id, authUserId]);

  useEffect(() => {
    if (!season?.id || !authUserId) return;
    if (!isMember) return;
    refreshMyRpTotal().catch(() => {});
  }, [season?.id, authUserId, isMember, refreshMyRpTotal]);

  const commitRP = async () => {
    setRpErr(null);
    if (!season?.id || !authUserId) return;
    if (!isMember) {
      setRpErr("You’re not a season member yet.");
      return;
    }

    const delta = Number(rpInput);
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || rpInput === "" || delta === 0) return;

    try {
      setRpSaving(true);

      const { data, error } = await supabase
        .from("rp_entries")
        .insert({
          season_id: season.id,
          user_id: authUserId,
          entry_date: rpEntryDate,
          delta_rp: delta,
        })
        .select("id")
        .single();

      if (error) throw error;
      const entryId = (data as any)?.id as string;

      setRpHistory((h) => [...h, { entryId, delta }]);
      setRpInput("");
      await refreshMyRpTotal();
    } catch (e: any) {
      setRpErr(e?.message ?? "Failed to add RP");
    } finally {
      setRpSaving(false);
    }
  };

  const undoRP = async () => {
    setRpErr(null);
    if (!season?.id || !authUserId) return;
    if (rpHistory.length === 0) return;

    const last = rpHistory[rpHistory.length - 1];
    try {
      setRpSaving(true);

      const { error } = await supabase
        .from("rp_entries")
        .delete()
        .eq("id", last.entryId)
        .eq("season_id", season.id)
        .eq("user_id", authUserId);

      if (error) throw error;

      setRpHistory((h) => h.slice(0, -1));
      setRpInput(String(last.delta));
      await refreshMyRpTotal();
    } catch (e: any) {
      setRpErr(e?.message ?? "Failed to undo RP");
    } finally {
      setRpSaving(false);
    }
  };

  // ===== Wins (HOST ONLY) =====
  const addWin = () => {
    if (!isHost) return;
    setWins((w) => w + 1);
    setWinsHistory((h) => [...h, 1]);
  };
  const undoWin = () => {
    if (!isHost) return;
    if (winsHistory.length === 0) return;
    setWins((w) => Math.max(0, w - 1));
    setWinsHistory((h) => h.slice(0, -1));
  };

  // ===== Derived =====
  const derived = useMemo(
    () =>
      players.map((p) => ({
        id: p.id,
        avgDamage: p.games > 0 ? p.totalDamage / p.games : 0,
      })),
    [players]
  );

  const groupAvgDamage = useMemo(() => {
    const withGames = players.filter((p) => p.games > 0);
    if (withGames.length === 0) return 0;
    return withGames.reduce((acc, p) => acc + p.totalDamage / p.games, 0) / withGames.length;
  }, [players]);

  // ===== Live-sync (host -> Supabase via API) =====
  const currentDoc = {
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      games: p.games,
      totalDamage: p.totalDamage,
      totalKills: p.totalKills,
      oneKGames: p.oneKGames,
      twoKGames: p.twoKGames,
      donuts: p.donuts,
    })),
    sessionGames,
    wins,
  };

const createSession = useCallback(async () => {
  if (!isHost) return;

  if (!season?.id) throw new Error("No active season id available to share.");

  const id = crypto.randomUUID();
  setSessionId(id);

  const res = await fetch(`/api/session/${id}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc: currentDoc }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || "Failed saving session");
  }

    if (!season?.id) throw new Error("No active season id available to share.");
    const url = `${window.location.origin}/s/${id}?season=${season.id}`;

  const ok = await copyToClipboard(url);
  alert(ok ? `Live session link copied!\n${url}` : `Couldn't copy automatically. Here it is:\n${url}`);
}, [currentDoc, isHost, season?.id]);


  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!sessionId) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      fetch(`/api/session/${sessionId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc: currentDoc }),
      }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [currentDoc, sessionId]);

  const resetLocalSession = () => {
    if (!isHost) return;
    setPlayers([makeNewPlayer()]);
    setSessionGames(0);
    setGameHistory([]);
    setWins(0);
    setWinsHistory([]);
  };

  // Small helper for button base styles
  const primaryButton =
    "inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed";
  const secondaryButton =
    "inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-2 text-xs sm:text-sm font-medium text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

  // ===== Boot gating =====
  if (bootLoading) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-8 flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading…</div>
      </main>
    );
  }

  if (bootErr) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-8 flex items-center justify-center">
        <div className="max-w-lg rounded-2xl border border-[#2A2E32] bg-[#121418] p-6">
          <div className="text-lg font-semibold text-white">Can’t load tracker</div>
          <div className="mt-2 text-sm text-slate-300">{bootErr}</div>
        </div>
      </main>
    );
  }

  // ===== UI =====
  return (
    <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-8">
      {showConfirm && isHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-neutral-900 p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-white">Start a new session?</h2>

            <p className="mt-2 text-sm text-neutral-400">
              Are you sure you want to create a new session? This will end the current one.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 cursor-pointer"
              >
                No
              </button>

              <button
                onClick={() => {
                  setShowConfirm(false);
                  resetLocalSession();
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 cursor-pointer"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1300px]">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#F5F5F5]">
              <span className="mr-2 inline-block border-l-4 border-[#E03A3E] pl-2 uppercase text-xs tracking-[0.2em] text-slate-400">
                Apex Legends
              </span>
              <span className="block text-2xl sm:text-3xl text-[#E03A3E]">Trio Session Tracker</span>
            </h1>

            <p className="mt-2 text-xs sm:text-sm text-slate-400">
              Signed in as{" "}
              <span className="font-semibold text-slate-200">{profile?.display_name ?? "—"}</span>
              {season ? (
                <>
                  {" "}
                  • Active season:{" "}
                  <span className="font-semibold text-slate-200">{season.name ?? season.id.slice(0, 8)}</span>
                </>
              ) : null}
              {" • "}
              {isHost ? (
                <span className="text-[#E03A3E] font-semibold">Host</span>
              ) : (
                <span className="text-slate-400">Viewer</span>
              )}
            </p>

            {!isMember && (
              <p className="mt-2 text-xs text-amber-300/90">
                You’re not a season member yet. You can view everything, but you can’t add RP until the host adds you to{" "}
                <span className="font-semibold text-slate-200">season_players</span>.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <button
              onClick={addPlayer}
              disabled={!isHost || players.length >= MAX_PLAYERS}
              className={secondaryButton}
              title={
                !isHost ? "Viewers cannot add players" : players.length >= MAX_PLAYERS ? "Max 3 players" : "Add another player"
              }
            >
              + Add Player
            </button>

            <button
              onClick={() => (isHost ? setShowConfirm(true) : null)}
              disabled={!isHost}
              className={secondaryButton}
              title={!isHost ? "Viewers cannot start a new session" : "Start a new session"}
            >
              New Session
            </button>

            <button
              className={primaryButton}
              disabled={!isHost}
              title={!isHost ? "Viewers cannot share live links" : "Share live link"}
              onClick={async () => {
                if (!isHost) return;
                try {
                  await createSession();
                } catch (err) {
                  console.error(err);
                  const msg = err instanceof Error ? err.message : String(err);
                  alert(`Failed to create session. ${msg ? `Details: ${msg}` : ""}`);
                }
              }}
            >
              Share Live Link
            </button>
          </div>
        </header>

        {/* KPI cards (UPDATED) */}
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Players</div>
            <div className="text-xl font-semibold text-slate-100">{players.length}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Number of Games</div>
            <div className="text-xl font-semibold text-slate-100">{sessionGames}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Number of Wins</div>
            <div className="text-xl font-semibold text-slate-100">{wins}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Group Avg Damage</div>
            <div className="text-xl font-semibold text-[#C9A86A]">{groupAvgDamage.toFixed(0)}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-gradient-to-br from-[#181B1F] via-[#1F2228] to-[#3A0F13] p-4 shadow-sm">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Your RP</div>
            <div className="text-xl font-semibold">
              <span className="text-[#E03A3E]">{totalRP}</span>
            </div>
          </div>
        </section>

        {/* Data Entry */}
        <section className="mb-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
          <h2 className="mb-3 text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-[#E03A3E]" />
            Data Entry
          </h2>

          {!isHost && (
            <div className="mb-3 rounded-xl border border-[#2A2E32] bg-[#181B1F] px-3 py-2 text-xs text-slate-300">
              Viewer mode: damage/kills entry is host-controlled. You can still add your RP below.
            </div>
          )}

          <div className="grid gap-3">
            {players.map((p, idx) => (
              <div
                key={p.id}
                className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[#181B1F]/60 px-3 py-2 sm:grid-cols-12"
              >
                <div className="text-xs font-semibold text-slate-500 sm:col-span-1">#{idx + 1}</div>

                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updateField(p.id, "name", e.target.value)}
                    placeholder="Player name"
                    disabled={!isHost}
                    className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-3">
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={p.damageInput}
                    onChange={(e) => updateField(p.id, "damageInput", e.target.value)}
                    placeholder="Damage (e.g. 1200)"
                    disabled={!isHost}
                    className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-3">
                  <input
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={p.killsInput}
                    onChange={(e) => updateField(p.id, "killsInput", e.target.value)}
                    placeholder="Kills (e.g. 3)"
                    disabled={!isHost}
                    className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-60"
                  />
                </div>

                <div className="sm:col-span-2 flex justify-end">
                  {players.length > 1 && (
                    <button
                      onClick={() => removePlayer(p.id)}
                      disabled={!isHost}
                      className="w-full rounded-xl border border-[#2A2E32] bg-[#181B1F] px-2 py-2 text-xs text-slate-300 hover:border-[#E03A3E] hover:bg-[#20242A] hover:text-white shadow-sm disabled:opacity-50"
                      title={!isHost ? "Viewers cannot remove players" : "Remove player"}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={addGameAll}
              disabled={!isHost}
              className={primaryButton}
              title={!isHost ? "Viewers cannot add games" : "Commit current inputs for all players as one game"}
            >
              Add Game (All Rows) ▶
            </button>
            <button
              onClick={undoGameAll}
              className={secondaryButton}
              disabled={!isHost || gameHistory.length === 0}
              title={!isHost ? "Viewers cannot undo games" : "Undo the last added game for all players"}
            >
              ◀ Undo Last Game
            </button>
          </div>
        </section>

        {/* RP & Wins Controls */}
        <section className="mb-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs sm:text-sm font-medium text-slate-200">
                Add Ranked Points (RP) — Your Total:{" "}
                <span className="font-semibold text-[#E03A3E]">{totalRP}</span>
                <span className="ml-3">
                  Wins: <span className="font-semibold text-[#C9A86A]">{wins}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">RP is self-tracked (writes to Supabase). Wins are host-controlled.</p>
              {rpErr && <p className="mt-2 text-[11px] text-red-300">{rpErr}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={rpEntryDate}
                onChange={(e) => setRpEntryDate(e.target.value)}
                disabled={!isMember || rpSaving}
                className="rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-60"
              />

              <input
                type="number"
                value={rpInput}
                onChange={(e) => setRpInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRP();
                }}
                placeholder="e.g. 45 or -23"
                disabled={!isMember || rpSaving}
                className="w-40 rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-60"
              />

              <button
                onClick={commitRP}
                disabled={!isMember || rpSaving}
                className={primaryButton}
                title={!isMember ? "Host must add you to season_players first" : "Add RP delta to your season total"}
              >
                {rpSaving ? "Saving…" : "Add RP ▶"}
              </button>

              <button
                onClick={undoRP}
                className={secondaryButton}
                disabled={!isMember || rpSaving || rpHistory.length === 0}
                title="Undo last RP add (deletes the last rp_entries row created in this session)"
              >
                ◀ Undo RP
              </button>

              <div className="mx-2 h-6 w-px bg-[#2A2E32]" />

              <button onClick={addWin} disabled={!isHost} className={primaryButton} title={!isHost ? "Viewers cannot add wins" : "Increment wins"}>
                +1 Win
              </button>

              <button
                onClick={undoWin}
                className={secondaryButton}
                disabled={!isHost || winsHistory.length === 0}
                title={!isHost ? "Viewers cannot undo wins" : "Undo last win"}
              >
                ◀ Undo Win
              </button>
            </div>
          </div>
        </section>

        {/* Player Stats table (UPDATED COLUMNS) */}
        <div className="overflow-x-auto rounded-2xl border border-[#2A2E32] bg-[#121418] shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#181B1F] text-slate-300 border-b border-[#2A2E32]">
              <tr>
                <th className="px-4 py-3 w-[44px] text-[11px] uppercase tracking-[0.16em]">#</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Name</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Games</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Total Damage</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Total Kills</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">1k Games</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">2k Games</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Avg Damage</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Donuts</th>
                <th className="px-4 py-3 w-[1%]" />
              </tr>
            </thead>

            <tbody>
              {players.map((p, idx) => {
                const avgs = derived.find((d) => d.id === p.id)!;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-[#1D2026] odd:bg-[#101319] even:bg-[#121418] hover:bg-[#181B23] transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-slate-100">{p.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-200">{p.games}</td>
                    <td className="px-4 py-3 text-slate-200">{p.totalDamage}</td>
                    <td className="px-4 py-3 text-slate-200">{p.totalKills}</td>
                    <td className="px-4 py-3 text-slate-200">{p.oneKGames}</td>
                    <td className="px-4 py-3 text-slate-200">{p.twoKGames}</td>
                    <td className="px-4 py-3 text-slate-200">{avgs.avgDamage.toFixed(1)}</td>
                    <td className="px-4 py-3 text-slate-200">{p.donuts}</td>
                    <td className="px-4 py-3">
                      {players.length > 1 && (
                        <button
                          onClick={() => removePlayer(p.id)}
                          disabled={!isHost}
                          className="rounded-xl border border-[#2A2E32] bg-[#181B1F] px-2 py-1 text-[11px] text-slate-300 hover:border-[#E03A3E] hover:bg-[#20242A] hover:text-white shadow-sm disabled:opacity-50"
                          title={!isHost ? "Viewers cannot remove players" : "Remove player"}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t border-[#2A2E32] bg-[#181B1F] font-semibold text-slate-100">
                <td className="px-4 py-3 text-slate-500">—</td>
                <td className="px-4 py-3 text-slate-300">Totals / Avg</td>

                {/* NOT SUMMING "Games" anymore */}
                <td className="px-4 py-3 text-slate-500">—</td>

                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.totalDamage, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.totalKills, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.oneKGames, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.twoKGames, 0)}</td>
                <td className="px-4 py-3">{groupAvgDamage.toFixed(1)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.donuts, 0)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          Workflows: Host enters stats →{" "}
          <span className="font-semibold text-slate-200">Add Game (All Rows)</span> to record a match. Viewers can add
          RP for themselves once added to the season.
        </p>
      </div>
    </main>
  );
}
