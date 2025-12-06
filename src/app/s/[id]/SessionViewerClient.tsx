/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";

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

export default function SessionViewerClient({ id }: { id: string }) {
  const [doc, setDoc] = useState<AppDoc | null>(null);
  const [viewerName, setViewerName] = useState<string>("");
  const [viewers, setViewers] = useState<{ id: string; name: string }[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ---- helpers -------------------------------------------------------------

  const fetchDoc = async () => {
    const { data, error } = await supabaseBrowser
      .from("sessions")
      .select("doc")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Fetch failed:", error.message);
      setDoc({ players: [], sessionGames: 0, totalRP: 0, wins: 0 });
      return;
    }

    setDoc((data?.doc as AppDoc) ?? { players: [], sessionGames: 0, totalRP: 0, wins: 0 });
    setLastUpdated(new Date());
  };

  const onManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchDoc();
    } finally {
      setIsRefreshing(false);
    }
  };

  // ---- effects -------------------------------------------------------------

  // Prompt name once
  useEffect(() => {
    let name = localStorage.getItem("apx_name") || "";
    if (!name) {
      name = prompt("Session Guest:")?.trim() || "Guest";
      localStorage.setItem("apx_name", name);
    }
    setViewerName(name);
  }, []);

  // Initial load + realtime row subscription
  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabaseBrowser.channel> | null = null;

    (async () => {
      if (!active) return;
      await fetchDoc();

      channel = supabaseBrowser
        .channel(`session-db:${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "sessions", filter: `id=eq.${id}` },
          (payload) => {
            const nextDoc = (payload.new as any)?.doc as AppDoc | undefined;
            if (nextDoc) {
              setDoc(nextDoc);
              setLastUpdated(new Date());
            }
          }
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabaseBrowser.removeChannel(channel);
    };
  }, [id]);

  // Presence bubbles
  useEffect(() => {
    if (!viewerName) return;

    const channel = supabaseBrowser.channel(`presence:${id}`, {
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

  // ---- derived values (no hooks below this line before returns) ------------

  const players = doc?.players ?? [];
  const totalDamage = players.reduce((a, p) => a + p.totalDamage, 0);
  const totalKills = players.reduce((a, p) => a + p.totalKills, 0);

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

        {/* header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold mb-1 tracking-tight text-[#F5F5F5]">
            <span className="mr-2 inline-block border-l-4 border-[#E03A3E] pl-2 uppercase text-[10px] tracking-[0.2em] text-slate-400">
              Apex Legends
            </span>
            <span className="block text-2xl sm:text-3xl text-[#E03A3E]">
              Session Viewer (Live)
            </span>
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
            Viewing a live synced trio session. Stats auto-update as the host plays.
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {lastUpdated
              ? `Last updated ${lastUpdated.toLocaleTimeString()}`
              : "Waiting for first update…"}
          </p>
        </header>

        {/* KPI cards */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">
              Players
            </div>
            <div className="text-xl font-semibold text-slate-100">{players.length}</div>
          </div>
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">
              Session Games
            </div>
            <div className="text-xl font-semibold text-slate-100">{doc.sessionGames}</div>
          </div>
          <div className="rounded-2xl border border-[#2A2E32] bg-gradient-to-br from-[#181B1F] via-[#1F2228] to-[#3A0F13] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-1">
              Total RP / Wins
            </div>
            <div className="text-xl font-semibold">
              <span className="text-[#E03A3E]">{doc.totalRP}</span>
              <span className="mx-1 text-slate-500">/</span>
              <span className="text-[#C9A86A]">{doc.wins}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-1">
              Squad Totals
            </div>
            <div className="text-sm text-slate-200">
              DMG: <span className="font-semibold text-[#C9A86A]">{totalDamage}</span>{" "}
              <span className="mx-1 text-slate-500">·</span>
              K: <span className="font-semibold text-slate-100">{totalKills}</span>
            </div>
          </div>
        </div>

        {/* Player table */}
        <div className="overflow-x-auto rounded-2xl border border-[#2A2E32] bg-[#121418] shadow-sm">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-[#181B1F] text-slate-300 border-b border-[#2A2E32]">
              <tr>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Name</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">Games</th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Total Damage
                </th>
                <th className="px-4 py-3 text-[11px] uppercase tracking-[0.16em]">
                  Total Kills
                </th>
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
          <button
            onClick={onManualRefresh}
            disabled={isRefreshing}
            className={secondaryButton}
          >
            {isRefreshing ? "Refreshing..." : "Refresh data"}
          </button>
          {isRefreshing && (
            <span className="text-[11px] text-slate-500">
              Fetching latest from Supabase…
            </span>
          )}
          {!isRefreshing && (
            <span className="text-[11px] text-slate-500">
              Data also updates automatically in real time.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
