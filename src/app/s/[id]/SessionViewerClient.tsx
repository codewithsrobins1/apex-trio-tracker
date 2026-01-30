/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
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
  }>;
  sessionGames: number;
  totalRP: number;
  wins: number;
};

type Season = {
  id: string;
  host_user_id: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
};

type RpEntry = {
  id: string;
  season_id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  delta_rp: number;
  created_at: string;
};

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function SessionViewerClient({ id }: { id: string }) {
  const [doc, setDoc] = useState<AppDoc | null>(null);

  // viewer identity (local only for bubbles)
  const [viewerName, setViewerName] = useState<string>("");
  const [viewers, setViewers] = useState<{ id: string; name: string }[]>([]);

  // auth/user
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // season + RP (B: source of truth)
  const [season, setSeason] = useState<Season | null>(null);
  const [myRpTotal, setMyRpTotal] = useState<number>(0);
  const [myRecentRp, setMyRecentRp] = useState<RpEntry[]>([]);

  // add RP form
  const [entryDate] = useState<string>(todayISODate()); // locked
  const [deltaRp, setDeltaRp] = useState<string>("");
  const [savingRp, setSavingRp] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // refresh UX
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ---- helpers -------------------------------------------------------------

  async function ensureAuth() {
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) throw sessionErr;

    let uid = sessionData.session?.user?.id ?? null;
    if (!uid) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      uid = data.user?.id ?? null;
    }

    if (!uid) throw new Error("Auth session missing (anonymous sign-in failed).");
    setAuthUserId(uid);
    return uid;
  }

  async function fetchActiveSeason() {
    const { data, error } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("No active season found.");
    setSeason(data as Season);
    return data as Season;
  }

  async function fetchDoc() {
    const { data, error } = await supabase.from("sessions").select("doc").eq("id", id).single();

    if (error) {
      console.error("Fetch failed:", error.message);
      setDoc({ players: [], sessionGames: 0, totalRP: 0, wins: 0 });
      setLastUpdated(new Date());
      return;
    }

    setDoc((data?.doc as AppDoc) ?? { players: [], sessionGames: 0, totalRP: 0, wins: 0 });
    setLastUpdated(new Date());
  }

  async function fetchMyRp(seasonId: string, uid: string) {
    // Sum client-side for now (simple + reliable)
    const { data, error } = await supabase
      .from("rp_entries")
      .select("id,season_id,user_id,entry_date,delta_rp,created_at")
      .eq("season_id", seasonId)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const rows = (data ?? []) as RpEntry[];
    setMyRecentRp(rows.slice(0, 10));
    const total = rows.reduce((acc, r) => acc + (Number(r.delta_rp) || 0), 0);
    setMyRpTotal(total);
  }

  const onManualRefresh = async () => {
    setIsRefreshing(true);
    setErr(null);
    try {
      await fetchDoc();
      if (season?.id && authUserId) {
        await fetchMyRp(season.id, authUserId);
      }
    } catch (e: any) {
      setErr(e?.message ?? "Refresh failed");
    } finally {
      setIsRefreshing(false);
    }
  };

  async function onAddRp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!season?.id || !authUserId) {
      setErr("Missing season or auth user id.");
      return;
    }

    try {
      setSavingRp(true);

      const n = Number(deltaRp);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) {
        throw new Error("Delta RP must be a non-zero whole number (e.g. 250 or -45).");
      }

      // RLS should enforce user_id = auth.uid(), but we still send it for clarity.
      const { error } = await supabase.from("rp_entries").insert({
        season_id: season.id,
        user_id: authUserId,
        entry_date: entryDate,
        delta_rp: n,
      });

      if (error) throw error;

      setDeltaRp("");
      await fetchMyRp(season.id, authUserId);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add RP");
    } finally {
      setSavingRp(false);
    }
  }

  // ---- effects -------------------------------------------------------------

  // Prompt name once (localStorage)
  useEffect(() => {
    let name = localStorage.getItem("apx_name") || "";
    if (!name) {
      name = prompt("Session Guest:")?.trim() || "Guest";
      localStorage.setItem("apx_name", name);
    }
    setViewerName(name);
  }, []);

  // Initial load: ensure auth, season, doc, then compute my RP (B)
  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setErr(null);

        const uid = await ensureAuth();
        if (!active) return;

        const s = await fetchActiveSeason();
        if (!active) return;

        await fetchDoc();
        if (!active) return;

        await fetchMyRp(s.id, uid);
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Failed to load session");
        // keep UI usable
        if (active) setDoc({ players: [], sessionGames: 0, totalRP: 0, wins: 0 });
      } finally {
        if (active) setLastUpdated(new Date());
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Presence bubbles
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
  const totalDamage = useMemo(() => players.reduce((a, p) => a + p.totalDamage, 0), [players]);
  const totalKills = useMemo(() => players.reduce((a, p) => a + p.totalKills, 0), [players]);

  const secondaryButton =
    "inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed";
  const primaryButton =
    "inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed";

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

        {/* header */}
        <header className="mb-6">
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

          {season && (
            <p className="text-[11px] text-slate-500 mt-1">
              Active season: <span className="text-slate-300">{season.name ?? season.id.slice(0, 8)}</span>
              {" · "}
              Role: <span className="text-slate-300">Player</span>
            </p>
          )}
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
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Session Games</div>
            <div className="text-xl font-semibold text-slate-100">{doc.sessionGames}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Wins</div>
            <div className="text-xl font-semibold text-slate-100">{doc.wins}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Your RP</div>
            <div className="text-xl font-semibold text-[#E03A3E]">{myRpTotal}</div>
          </div>

          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">Squad Totals</div>
            <div className="text-sm text-slate-200">
              DMG: <span className="font-semibold text-[#C9A86A]">{totalDamage}</span>{" "}
              <span className="mx-1 text-slate-500">·</span>K:{" "}
              <span className="font-semibold text-slate-100">{totalKills}</span>
            </div>
          </div>
        </div>

        {/* Add RP (player-only) */}
        <section className="mb-4 rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
          <div className="text-xs sm:text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span className="h-3 w-1 rounded-sm bg-[#E03A3E]" />
            Add RP (yourself only)
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Date is locked to today. Inserts are protected by RLS (you can only write your own rows).
          </p>

          <form onSubmit={onAddRp} className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Date</div>
              <input
                type="date"
                value={entryDate}
                disabled
                className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-400 outline-none"
              />
            </label>

            <label className="block">
              <div className="text-[11px] text-slate-500 mb-1">Delta RP</div>
              <input
                inputMode="numeric"
                value={deltaRp}
                onChange={(e) => setDeltaRp(e.target.value)}
                placeholder="e.g. 250 or -45"
                className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E]"
              />
            </label>

            <button
              type="submit"
              disabled={
                savingRp ||
                !authUserId ||
                !season?.id ||
                deltaRp.trim() === "" ||
                !Number.isInteger(Number(deltaRp)) ||
                Number(deltaRp) === 0
              }
              className={primaryButton}
            >
              {savingRp ? "Adding…" : "Add RP"}
            </button>
          </form>

          {myRecentRp.length > 0 && (
            <div className="mt-3 text-[11px] text-slate-500">
              Latest:{" "}
              <span className="text-slate-300">
                {myRecentRp[0].entry_date} ({myRecentRp[0].delta_rp > 0 ? "+" : ""}
                {myRecentRp[0].delta_rp})
              </span>
            </div>
          )}
        </section>

        {/* Player table (host snapshot) */}
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
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
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
                </tr>
              ))}
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
