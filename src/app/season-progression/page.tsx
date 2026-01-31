/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeasonRow = {
  id: string;
  host_user_id: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
  season_number?: number | null;
};

type ProfileRow = { display_name: string | null };

type SeasonPlayerRow = {
  user_id: string;
  profiles: ProfileRow | null;
};

type SnapshotRow = {
  user_id: string;
  post_date: string; // YYYY-MM-DD
  delta_rp: number;
};

type Player = { userId: string; name: string };

type ChartPoint = {
  date: string; // MM/DD/YY
  __delta?: Record<string, number>; // per-player delta on that date (by display_name)
  [k: string]: any; // dynamic player series by display_name
};

function fmtMMDDYY(iso: string) {
  // "2026-02-01" -> "02/01/26" in local (fine because we force midnight)
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

function safeName(v: string | null | undefined) {
  const s = (v ?? "").trim();
  return s.length ? s : "Unknown";
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Builds cumulative RP series by date from snapshot deltas.
 * Output:
 *  [
 *    { date: "02/01/26", "Sean": 200, __delta:{Sean:200} },
 *    { date: "02/02/26", "Sean": 100, __delta:{Sean:-100} },
 *  ]
 */
function buildCumulativeSeriesFromSnapshots(rows: SnapshotRow[], players: Player[]): ChartPoint[] {
  // group deltas by date then by user
  const byDate: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const dateKey = fmtMMDDYY(r.post_date);
    if (!byDate[dateKey]) byDate[dateKey] = {};
    byDate[dateKey][r.user_id] = (byDate[dateKey][r.user_id] ?? 0) + (Number(r.delta_rp) || 0);
  }

  // sort dates chronologically
  const dates = Object.keys(byDate).sort((a, b) => {
    const [am, ad, ay] = a.split("/").map(Number);
    const [bm, bd, by] = b.split("/").map(Number);
    const da = new Date(2000 + ay, am - 1, ad).getTime();
    const db = new Date(2000 + by, bm - 1, bd).getTime();
    return da - db;
  });

  // cumulative totals per user id
  const totals: Record<string, number> = {};
  players.forEach((p) => (totals[p.userId] = 0));

  const out: ChartPoint[] = [];

  for (const d of dates) {
    const deltaByUser = byDate[d] ?? {};
    const point: ChartPoint = { date: d, __delta: {} };

    for (const p of players) {
      const delta = Number(deltaByUser[p.userId] ?? 0);
      totals[p.userId] = (totals[p.userId] ?? 0) + delta;
      point[p.name] = totals[p.userId];
      point.__delta![p.name] = delta;
    }

    out.push(point);
  }

  return out;
}

function colorForIndex(i: number) {
  const palette = ["#E03A3E", "#C9A86A", "#3B82F6", "#22C55E", "#A855F7", "#F97316"];
  return palette[i % palette.length];
}

export default function SeasonProgressionPage() {
  const router = useRouter();

  const [authUserName, setAuthUserName] = useState<string>("—");
  const [season, setSeason] = useState<SeasonRow | null>(null);
  const [isHost, setIsHost] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Selection UI
  const [allPlayers, setAllPlayers] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({}); // by display_name

  // Taller by default
  const [chartHeight, setChartHeight] = useState<number>(720);

  const selectedNames = useMemo(() => {
    if (allPlayers) return players.map((p) => p.name);
    return players.map((p) => p.name).filter((n) => selected[n]);
  }, [allPlayers, players, selected]);

  const playerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    players.forEach((p, idx) => (map[p.name] = colorForIndex(idx)));
    return map;
  }, [players]);

  const loadSeasonAndMe = useCallback(async () => {
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;

    const uid = sess.session?.user?.id;
    if (!uid) {
      router.replace("/");
      return null;
    }

    const { data: me, error: meErr } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", uid)
      .maybeSingle();

    if (meErr) throw meErr;
    setAuthUserName(safeName(me?.display_name));

    const { data: s, error: seasonErr } = await supabase
      .from("seasons")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (seasonErr) throw seasonErr;
    if (!s) throw new Error("No active season found.");

    setSeason(s as SeasonRow);
    setIsHost((s as SeasonRow).host_user_id === uid);

    return { uid, seasonId: (s as SeasonRow).id };
  }, [router]);

  const loadPlayersAndSeries = useCallback(async (seasonId: string) => {
    // season_players + profiles join
    const { data: sp, error: spErr } = await supabase
      .from("season_players")
      .select(
        `
        user_id,
        profiles:profiles ( display_name )
      `
      )
      .eq("season_id", seasonId);

    if (spErr) throw spErr;

    const list: Player[] = (sp ?? []).map((r: any) => ({
      userId: String(r.user_id),
      name: safeName(r.profiles?.display_name),
    }));

    list.sort((a, b) => a.name.localeCompare(b.name));
    setPlayers(list);

    // init selection: all checked
    const nextSelected: Record<string, boolean> = {};
    list.forEach((p) => (nextSelected[p.name] = true));
    setSelected(nextSelected);

    // IMPORTANT: read from season_rp_snapshots (official, posted-only)
    const { data: snap, error: snapErr } = await supabase
      .from("season_rp_snapshots")
      .select("user_id, post_date, delta_rp")
      .eq("season_id", seasonId)
      .order("post_date", { ascending: true })
      .limit(5000);

    if (snapErr) throw snapErr;

    const rows: SnapshotRow[] = (snap ?? []).map((r: any) => ({
      user_id: String(r.user_id),
      post_date: String(r.post_date),
      delta_rp: Number(r.delta_rp) || 0,
    }));

    const series = buildCumulativeSeriesFromSnapshots(rows, list);
    setChartData(series);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!season?.id) return;
    setErr(null);
    setRefreshing(true);
    try {
      await loadPlayersAndSeries(season.id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to refresh graph");
    } finally {
      setRefreshing(false);
    }
  }, [season?.id, loadPlayersAndSeries]);

  const resetSeason = useCallback(async () => {
    if (!season?.id) return;
    if (!isHost) return;

    const ok = window.confirm(
      "Are you sure you want to reset the season graph?\n\nThis deletes ALL season_rp_snapshots for this season (official posted RP deltas)."
    );
    if (!ok) return;

    setErr(null);
    setRefreshing(true);
    try {
      // Delete snapshots (not rp_entries)
      const { error } = await supabase.from("season_rp_snapshots").delete().eq("season_id", season.id);
      if (error) throw error;

      await loadPlayersAndSeries(season.id);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to reset season");
    } finally {
      setRefreshing(false);
    }
  }, [season?.id, isHost, loadPlayersAndSeries]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const boot = await loadSeasonAndMe();
        if (!active) return;
        if (!boot) return;

        await loadPlayersAndSeries(boot.seasonId);
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Failed to load graph");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadSeasonAndMe, loadPlayersAndSeries]);

  // checkbox behavior: if allPlayers checked, disable others
  const toggleAll = () => {
    setAllPlayers((v) => {
      const next = !v;
      if (next === false) {
        const any = Object.values(selected).some(Boolean);
        if (!any && players.length) {
          setSelected((prev) => ({ ...prev, [players[0].name]: true }));
        }
      }
      return next;
    });
  };

  const toggleName = (name: string) => {
    if (allPlayers) return;
    setSelected((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      if (!Object.values(next).some(Boolean)) return prev;
      return next;
    });
  };

  const page = "min-h-screen bg-[#050608] text-slate-100 px-4 py-8";
  const container = "mx-auto max-w-[1300px]";
  const card = "rounded-2xl border border-[#2A2E32] bg-[#121418] shadow-sm";
  const cardPad = "p-4 sm:p-5";
  const title = "text-3xl sm:text-4xl font-extrabold tracking-tight text-[#E03A3E]";
  const btnPrimary =
    "cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed";
  const btnGhost =
    "cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-2 text-xs sm:text-sm font-semibold text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed";

  if (loading) {
    return (
      <main className={page}>
        <div className={classNames(container, "grid place-items-center")}>
          <div className="text-sm text-slate-400">Loading…</div>
        </div>
      </main>
    );
  }

  return (
    <main className={page}>
      <div className={container}>
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="uppercase tracking-[0.35em] text-[10px] text-slate-500 mb-2">Apex Legends</div>
            <h1 className={title}>Season Progression</h1>
            <div className="mt-2 text-xs text-slate-400">
              Signed in as <span className="text-slate-200 font-semibold">{authUserName}</span>
              {"  •  "}
              Season{" "}
              <span className="text-slate-200 font-semibold">
                {season?.season_number ?? (season?.name ?? (season?.id ? season.id.slice(0, 8) : "—"))}
              </span>
              {"  •  "}
              Role:{" "}
              <span className={classNames("font-semibold", isHost ? "text-[#E03A3E]" : "text-slate-200")}>
                {isHost ? "Host" : "Player"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Graph updates only when the host clicks <span className="text-slate-200 font-semibold">Post Session to Discord</span>.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={btnGhost} onClick={refreshAll} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh graph"}
            </button>

            <button
              className={btnGhost}
              onClick={resetSeason}
              disabled={refreshing || !isHost}
              title={!isHost ? "Only the host can reset the season" : "Delete all snapshots for this season"}
            >
              Reset season
            </button>

            <button className={btnGhost} onClick={() => router.push("/")} disabled={refreshing}>
              Back to Home
            </button>
          </div>
        </header>

        {err && (
          <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* Player selection + chart height */}
        <section className={classNames(card, "mb-4")}>
          <div className={cardPad}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">Player Selection</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  All Players disables individual selection. Y-axis is fixed -5000 to 5000.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-[11px] text-slate-400">Chart height</div>
                <input
                  type="range"
                  min={520}
                  max={980}
                  value={chartHeight}
                  onChange={(e) => setChartHeight(Number(e.target.value))}
                  className="cursor-pointer w-40"
                />
                <div className="text-[11px] text-slate-400 w-[52px] text-right">{chartHeight}px</div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={allPlayers}
                  onChange={toggleAll}
                  className="cursor-pointer h-4 w-4 accent-[#E03A3E]"
                />
                <span className="font-semibold text-slate-100">All Players</span>
              </label>

              {players.length === 0 ? (
                <div className="text-sm text-slate-500">No season players yet.</div>
              ) : (
                <div className="flex flex-wrap items-center gap-4">
                  {players.map((p) => (
                    <label key={p.userId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={allPlayers ? true : !!selected[p.name]}
                        disabled={allPlayers}
                        onChange={() => toggleName(p.name)}
                        className={classNames(
                          "h-4 w-4 accent-[#E03A3E]",
                          allPlayers ? "cursor-not-allowed opacity-40" : "cursor-pointer"
                        )}
                      />
                      <span className={classNames(allPlayers ? "text-slate-600" : "text-slate-200")}>
                        {p.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Chart */}
        <section className={card}>
          <div className={cardPad}>
            <div className="text-sm font-semibold text-slate-100">Ranked RP Over Time</div>
            <div className="mt-1 text-[11px] text-slate-500">
              X-axis dates are MM/DD/YY (diagonal). Tooltip shows cumulative value and that day’s posted delta.
            </div>
          </div>

          <div className="px-4 pb-5">
            <div
              className="w-full rounded-2xl border border-[#2A2E32] bg-[#0E1115] p-3"
              style={{ height: chartHeight }}
            >
              {chartData.length === 0 || selectedNames.length === 0 ? (
                <div className="h-full w-full grid place-items-center text-sm text-slate-500">
                  No posted RP snapshots yet. Have the host Post Session to Discord.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis
                      dataKey="date"
                      angle={-35}
                      textAnchor="end"
                      height={70}
                      tick={{ fill: "#94A3B8", fontSize: 12 }}
                    />
                    <YAxis
                      domain={[-5000, 5000]}
                      tick={{ fill: "#94A3B8", fontSize: 12 }}
                      tickCount={11}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0B0D11",
                        border: "1px solid #2A2E32",
                        borderRadius: "12px",
                        color: "#E2E8F0",
                        fontSize: "12px",
                      }}
                      formatter={(value: any, name: any, props: any) => {
                        const delta = props?.payload?.__delta?.[name] ?? 0;
                        const sign = delta > 0 ? "+" : "";
                        return [`${value} (${sign}${delta})`, name];
                      }}
                      labelStyle={{ color: "#CBD5E1" }}
                    />
                    <Legend />

                    {selectedNames.map((name) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={playerColorMap[name]}
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 6 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
