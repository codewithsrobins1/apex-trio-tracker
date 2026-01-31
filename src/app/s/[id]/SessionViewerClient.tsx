/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type AppDoc = {
  players: Array<{
    id: string;
    name: string;
    games: number;
    totalDamage: number;
    totalKills: number;
    oneKGames: number;
    twoKGames: number;
    donuts?: number; // optional for backward compatibility
  }>;
  sessionGames: number;
  wins: number;
};

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function SessionViewerClient({
  id,
  seasonId,
}: {
  id: string;
  seasonId: string | null;
}) {
  const router = useRouter();

  const [doc, setDoc] = useState<AppDoc | null>(null);

  // viewer name (presence only)
  const [viewerName, setViewerName] = useState<string>("");

  // auth
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // presence bubbles
  const [viewers, setViewers] = useState<{ id: string; name: string }[]>([]);

  // refresh + status
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // errors
  const [err, setErr] = useState<string | null>(null);

  // RP entry (player only)
  const [deltaRp, setDeltaRp] = useState<string>("");
  const [savingRp, setSavingRp] = useState(false);
  const [myRpTotal, setMyRpTotal] = useState<number>(0);

  const lockedDate = useMemo(() => todayISODate(), []);

  // ---- helpers -------------------------------------------------------------

  const fetchDoc = useCallback(async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("doc")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Fetch failed:", error.message);
      // Keep UI functional even if missing
      setDoc({ players: [], sessionGames: 0, wins: 0 });
      setLastUpdated(new Date());
      return;
    }

    const next = (data?.doc as AppDoc) ?? { players: [], sessionGames: 0, wins: 0 };
    setDoc(next);
    setLastUpdated(new Date());
  }, [id]);

  const refreshMyRpTotal = useCallback(
    async (season: string, uid: string) => {
      const { data, error } = await supabase
        .from("rp_entries")
        .select("delta_rp")
        .eq("season_id", season)
        .eq("user_id", uid);

      if (error) throw error;
      const total = (data ?? []).reduce((acc, r: any) => acc + (Number(r.delta_rp) || 0), 0);
      setMyRpTotal(total);
    },
    []
  );

  const onManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchDoc();
      if (seasonId && authUserId) {
        await refreshMyRpTotal(seasonId, authUserId);
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchDoc, seasonId, authUserId, refreshMyRpTotal]);

  const goToUsernameGate = () => {
    // Send them to / (your username entry page), then come back here
    const returnTo = `${window.location.pathname}${window.location.search}`;
    router.push(`/?redirect=${encodeURIComponent(returnTo)}`);
  };

  async function onAddRp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!seasonId) {
      setErr("Missing seasonId. Open the shared link with ?season=<season_id>.");
      return;
    }
    if (!authUserId) {
      setErr("You must enter a username first.");
      return;
    }

    try {
      setSavingRp(true);

      const n = Number(deltaRp);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) {
        throw new Error("Delta RP must be a non-zero whole number (e.g. 50 or -23).");
      }

      const { error } = await supabase.from("rp_entries").insert({
        season_id: seasonId,
        user_id: authUserId, // RLS enforces this matches auth.uid()
        entry_date: lockedDate,
        delta_rp: n,
      });

      if (error) throw error;

      setDeltaRp("");
      await refreshMyRpTotal(seasonId, authUserId);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add RP");
    } finally {
      setSavingRp(false);
    }
  }

  // ---- effects -------------------------------------------------------------
  // auth session (NO anonymous sign-in here)
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const uid = data.session?.user?.id ?? null;
        if (!active) return;
        setAuthUserId(uid);
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Failed to read auth session");
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // initial load (+ RP total if authed)
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setErr(null);
        await fetchDoc();
        if (!active) return;

        if (seasonId && authUserId) {
          await refreshMyRpTotal(seasonId, authUserId);
        }
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Failed to initialize viewer");
      }
    })();

    return () => {
      active = false;
    };
  }, [fetchDoc, seasonId, authUserId, refreshMyRpTotal]);

  // presence bubbles (optional, but you already like them)
  useEffect(() => {
    if (!viewerName) return;

    const channel = supabase.channel(`presence:${id}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { name: string }[]>;
        const list: { id: string; name: string }[] = [];
        Object.entries(state).forEach(([key, arr]) => {
          arr.forEach((meta) => list.push({ id: key, name: meta.name }));
        });
        setViewers(list);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: viewerName });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [id, viewerName]);

  // ---- derived -------------------------------------------------------------

  const players = doc?.players ?? [];

  const groupAvgDamage = useMemo(() => {
    const withGames = players.filter((p) => (p.games ?? 0) > 0);
    if (withGames.length === 0) return 0;
    return withGames.reduce((acc, p) => acc + p.totalDamage / p.games, 0) / withGames.length;
  }, [players]);

  const derived = useMemo(
    () =>
      players.map((p) => ({
        id: p.id,
        avgDamage: p.games > 0 ? p.totalDamage / p.games : 0,
        donuts: Number(p.donuts ?? 0),
      })),
    [players]
  );

  const canSubmitRp = useMemo(() => {
    const n = Number(deltaRp);
    if (!seasonId) return false;
    if (!authUserId) return false;
    if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) return false;
    if (deltaRp.trim() === "") return false;
    return !savingRp;
  }, [deltaRp, savingRp, seasonId, authUserId]);

  const primaryButton =
    "inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed";
  const secondaryButton =
    "inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed";

  if (!doc) {
    return (
      <div className="min-h-screen bg-[#050608] text-slate-100 px-4 py-8 grid place-items-center">
        <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] px-6 py-4 text-sm text-slate-300 shadow-sm">
          Loading session…
        </div>
      </div>
    );
  }

  // ---- UI ------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#050608] text-slate-100 px-4 py-8">
      <div className="relative mx-auto max-w-[1300px]">
        {/* presence */}
        <div className="absolute right-0 top-0 flex -space-x-2">
          {viewers.slice(0, 5).map((v) => {
            const initial = (v.name?.trim()?.[0] || "?").toUpperCase();
            return (
              <div
                key={v.id}
                title={v.name}
                className="h-8 w-8 rounded-full bg-[#181B1F] text-slate-100 border border-[#2A2E32] grid place-items-center text-xs"
              >
                {initial}
              </div>
            );
          })}
          {viewers.length > 5 && (
            <div className="h-8 w-8 rounded-full bg-[#181B1F] text-slate-100 border border-[#2A2E32] grid place-items-center text-xs">
              +{viewers.length - 5}
            </div>
          )}
        </div>

        <header className="mb-4">
          <h1 className="text-2xl font-bold mb-1 tracking-tight text-[#F5F5F5]">
            <span className="mr-2 inline-block border-l-4 border-[#E03A3E] pl-2 uppercase text-[10px] tracking-[0.2em] text-slate-400">
              Apex Legends
            </span>
            <span className="block text-2xl sm:text-3xl text-[#E03A3E]">Session Viewer</span>
          </h1>

          <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
            Viewing a shared trio session. Click Refresh to pull the latest stats.
          </p>

          <p className="text-[11px] text-slate-500 mt-1">
            {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : "Not loaded yet…"}
          </p>

          <p className="text-[11px] text-slate-500 mt-1">
            {seasonId ? (
              <>
                Active season: <span className="text-slate-300 font-mono">{seasonId.slice(0, 8)}</span> · Role:{" "}
                <span className="text-slate-200 font-semibold">Viewer</span>
              </>
            ) : (
              <>
                Missing <span className="text-slate-300 font-mono">?season=</span> in the URL (RP will be disabled)
              </>
            )}
          </p>
        </header>

        {err && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* KPI cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Players</div>
            <div className="text-xl font-semibold text-slate-100">{players.length}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Games</div>
            <div className="text-xl font-semibold text-slate-100">{doc.sessionGames}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Wins</div>
            <div className="text-xl font-semibold text-slate-100">{doc.wins}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">
              Group Avg Damage
            </div>
            <div className="text-xl font-semibold text-[#C9A86A]">{groupAvgDamage.toFixed(0)}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-gradient-to-br from-[#181B1F] via-[#1F2228] to-[#3A0F13] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">Your RP</div>
            <div className="text-xl font-semibold">
              <span className="text-[#E03A3E]">{authUserId ? myRpTotal : "—"}</span>
            </div>
          </div>
        </div>

        {/* Add RP */}
        <section className="mb-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
          <h2 className="mb-2 text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-[#E03A3E]" />
            Add RP (requires username)
          </h2>

          {!authUserId && (
            <div className="mb-3 rounded-xl border border-[#2A2E32] bg-[#181B1F] px-3 py-2 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                RP is disabled for guests. Enter your username to sign in, then come back to this session.
              </div>
              <button onClick={goToUsernameGate} className={primaryButton}>
                Enter username
              </button>
            </div>
          )}

          <form onSubmit={onAddRp} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="block">
              <div className="text-[11px] text-slate-400 mb-2">Date</div>
              <input
                type="text"
                value={lockedDate}
                disabled
                className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none opacity-80"
              />
            </label>

            <label className="block">
              <div className="text-[11px] text-slate-400 mb-2">Delta RP</div>
              <input
                inputMode="numeric"
                type="number"
                value={deltaRp}
                onChange={(e) => setDeltaRp(e.target.value)}
                placeholder="e.g. 50 or -23"
                disabled={!authUserId || !seasonId}
                className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E] disabled:opacity-60"
              />
            </label>

            <button type="submit" disabled={!canSubmitRp} className={primaryButton}>
              {savingRp ? "Adding…" : "Add RP"}
            </button>
          </form>

          {!seasonId && (
            <div className="mt-3 text-[11px] text-red-200/80">
              RP disabled: open this link as <span className="font-mono">/s/{id}?season=&lt;season_id&gt;</span>
            </div>
          )}
        </section>

        {/* Player table */}
        <div className="overflow-x-auto rounded-2xl border border-[#2A2E32] bg-[#121418] shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#181B1F] text-slate-300 border-b border-[#2A2E32]">
              <tr>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Name</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Games</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Total Damage</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Total Kills</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">1k</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">2k</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Avg Damage</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Donuts</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const d = derived.find((x) => x.id === p.id)!;
                return (
                  <tr
                    key={p.id}
                    className="border-t border-[#1D2026] odd:bg-[#101319] even:bg-[#121418] hover:bg-[#181B23] transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-100">{p.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-200">{p.games}</td>
                    <td className="px-4 py-3 text-slate-200">{p.totalDamage}</td>
                    <td className="px-4 py-3 text-slate-200">{p.totalKills}</td>
                    <td className="px-4 py-3 text-slate-200">{p.oneKGames}</td>
                    <td className="px-4 py-3 text-slate-200">{p.twoKGames}</td>
                    <td className="px-4 py-3 text-slate-200">{d.avgDamage.toFixed(1)}</td>
                    <td className="px-4 py-3 text-slate-200">{d.donuts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Manual refresh */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={onManualRefresh} disabled={isRefreshing} className={secondaryButton}>
            {isRefreshing ? "Refreshing..." : "Refresh data"}
          </button>

          <span className="text-[11px] text-slate-500">
            {isRefreshing ? "Fetching latest from Supabase…" : "Manual refresh only."}
          </span>
        </div>
      </div>
    </div>
  );
}
