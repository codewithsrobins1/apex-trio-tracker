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

  if (!doc) return <div className="p-6">Loading session…</div>;

  // ---- UI ------------------------------------------------------------------

  return (
    <div className="relative px-4 py-8 mx-auto max-w-[1300px]">
      {/* presence */}
      <div className="absolute right-4 top-4 flex -space-x-2">
        {viewers.slice(0, 5).map((v) => {
          const initial = (v.name?.trim()?.[0] || "?").toUpperCase();
          return (
            <div
              key={v.id}
              title={v.name}
              className="h-8 w-8 rounded-full bg-neutral-800 text-white border border-white/20 grid place-items-center text-xs"
            >
              {initial}
            </div>
          );
        })}
        {viewers.length > 5 && (
          <div className="h-8 w-8 rounded-full bg-neutral-700 text-white border border-white/20 grid place-items-center text-xs">
            +{viewers.length - 5}
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold mb-1">Apex Session (Live)</h1>
      <p className="text-xs text-neutral-500 mb-4">
        {lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : "—"}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500 mb-1">Players</div>
          <div className="text-xl font-semibold">{players.length}</div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500 mb-1">Session Games</div>
          <div className="text-xl font-semibold">{doc.sessionGames}</div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500 mb-1">Total RP / Wins</div>
          <div className="text-xl font-semibold">
            {doc.totalRP} / {doc.wins}
          </div>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500 mb-1">Totals</div>
          <div className="text-sm">DMG: {totalDamage} · K: {totalKills}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-50 text-neutral-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Games</th>
              <th className="px-4 py-3">Total Damage</th>
              <th className="px-4 py-3">Total Kills</th>
              <th className="px-4 py-3">1k</th>
              <th className="px-4 py-3">2k</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id} className="border-t border-neutral-100">
                <td className="px-4 py-3">{p.name || "—"}</td>
                <td className="px-4 py-3">{p.games}</td>
                <td className="px-4 py-3">{p.totalDamage}</td>
                <td className="px-4 py-3">{p.totalKills}</td>
                <td className="px-4 py-3">{p.oneKGames}</td>
                <td className="px-4 py-3">{p.twoKGames}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manual refresh */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onManualRefresh}
          disabled={isRefreshing}
          className="rounded-lg border px-3 py-1.5 text-sm shadow-sm disabled:opacity-60 cursor-pointer"
        >
          {isRefreshing ? "Refreshing..." : "Refresh data"}
        </button>
        {isRefreshing && (
          <span className="text-xs text-neutral-500">Fetching latest from Supabase…</span>
        )}
      </div>
    </div>
  );
}
