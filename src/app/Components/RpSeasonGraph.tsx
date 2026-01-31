/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/lib/supabase/client";

type ProfileRow = { id: string; display_name: string | null };
type SeasonPlayerRow = { user_id: string };
type RpEntryRow = { user_id: string; entry_date: string; delta_rp: number };

function isoToday() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildDateRange(startISO: string, endISO: string) {
  const out: string[] = [];
  let cur = startISO;
  while (cur <= endISO) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function safeKey(name: string) {
  // Recharts uses object keys; keep it stable/clean
  return name.replace(/[^\w\s-]/g, "").trim() || "Player";
}

export default function RpSeasonGraph({
  seasonId,
  height = 320,
  daysBack = 30,
  refreshKey,
}: {
  seasonId: string;
  height?: number;
  daysBack?: number; // default view window
  refreshKey?: number; // bump this to force reload
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [userIds, setUserIds] = useState<string[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<RpEntryRow[]>([]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setErr(null);
        setLoading(true);

        // 1) Get season members
        const { data: members, error: memErr } = await supabase
          .from("season_players")
          .select("user_id")
          .eq("season_id", seasonId);

        if (memErr) throw memErr;

        const ids = (members ?? []).map((m: SeasonPlayerRow) => m.user_id);
        if (!active) return;
        setUserIds(ids);

        // 2) Fetch profiles for labels
        if (ids.length > 0) {
          const { data: profs, error: profErr } = await supabase
            .from("profiles")
            .select("id,display_name")
            .in("id", ids);

          if (profErr) throw profErr;

          const map: Record<string, string> = {};
          (profs ?? []).forEach((p: ProfileRow) => {
            map[p.id] = p.display_name?.trim() || p.id.slice(0, 8);
          });
          if (!active) return;
          setNameById(map);
        } else {
          if (!active) return;
          setNameById({});
        }

        // 3) Fetch RP entries for season (for those members)
        // NOTE: if you want to allow "host sees all entries" make sure your RLS allows select.
        if (ids.length > 0) {
          const start = addDaysISO(isoToday(), -Math.max(1, daysBack));
          const end = isoToday();

          const { data: rp, error: rpErr } = await supabase
            .from("rp_entries")
            .select("user_id,entry_date,delta_rp")
            .eq("season_id", seasonId)
            .in("user_id", ids)
            .gte("entry_date", start)
            .lte("entry_date", end)
            .order("entry_date", { ascending: true });

          if (rpErr) throw rpErr;

          if (!active) return;
          setEntries((rp ?? []) as RpEntryRow[]);
        } else {
          if (!active) return;
          setEntries([]);
        }
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Failed to load RP graph data");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [seasonId, daysBack, refreshKey]);

  const chartData = useMemo(() => {
    if (userIds.length === 0) return [];

    const end = isoToday();
    const start = addDaysISO(end, -Math.max(1, daysBack));
    const days = buildDateRange(start, end);

    // Map userId -> key name used in chart object
    const keyById: Record<string, string> = {};
    userIds.forEach((uid) => {
      const display = nameById[uid] || uid.slice(0, 8);
      keyById[uid] = safeKey(display);
    });

    // Group deltas by date then userId
    const deltaByDateUser: Record<string, Record<string, number>> = {};
    for (const r of entries) {
      const d = r.entry_date;
      const uid = r.user_id;
      const n = Number(r.delta_rp) || 0;
      if (!deltaByDateUser[d]) deltaByDateUser[d] = {};
      deltaByDateUser[d][uid] = (deltaByDateUser[d][uid] || 0) + n;
    }

    // Build cumulative totals per day
    const running: Record<string, number> = {};
    userIds.forEach((uid) => (running[uid] = 0));

    const out: any[] = [];
    for (const day of days) {
      const row: any = { date: day };

      for (const uid of userIds) {
        const delta = deltaByDateUser[day]?.[uid] || 0;
        running[uid] += delta;
        row[keyById[uid]] = running[uid];
      }

      out.push(row);
    }

    return out;
  }, [entries, userIds, nameById, daysBack]);

  const seriesKeys = useMemo(() => {
    // stable order: userIds order -> display name
    return userIds.map((uid) => safeKey(nameById[uid] || uid.slice(0, 8)));
  }, [userIds, nameById]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
        <div className="text-sm text-slate-400">Loading RP graph…</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#2A2E32] bg-[#121418] p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            RP Progress (Season)
          </div>
          <div className="mt-1 text-sm text-slate-300">
            Last {daysBack} days · cumulative totals
          </div>
        </div>
        {err && <div className="text-xs text-red-300">{err}</div>}
      </div>

      {chartData.length === 0 ? (
        <div className="text-sm text-slate-400">No data yet.</div>
      ) : (
        <div style={{ width: "100%", height }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />

              {seriesKeys.map((k, idx) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  strokeWidth={2}
                  dot={false}
                  // keep strokes deterministic without needing a palette file
                  stroke={`hsl(${(idx * 80) % 360} 70% 60%)`}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
