"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { fetchMyProfile, type Profile } from "@/lib/auth/usernameAuth";

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
  // local date -> YYYY-MM-DD
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function InGameTrackerPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  const [season, setSeason] = useState<Season | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isMember, setIsMember] = useState(false);

  const [entryDate, setEntryDate] = useState(todayISODate());
  const [deltaRp, setDeltaRp] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const [recent, setRecent] = useState<RpEntry[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setErr(null);

        // 1) auth + profile (profile exists from landing page flow)
        const p = await fetchMyProfile();
        if (!mounted) return;
        setProfile(p);

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        const uid = sessionData.session?.user?.id ?? null;
        if (!uid) throw new Error("Not signed in. Go back to Home and enter a username.");
        setAuthUserId(uid);

        // 2) load active season (newest active)
        const { data: s, error: seasonErr } = await supabase
          .from("seasons")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (seasonErr) throw seasonErr;
        if (!s) throw new Error("No active season found. Create one in Supabase (or wire the modal next).");
        setSeason(s as Season);

        // 3) compute host + membership
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

        // 4) load recent RP entries for this user (verification)
        const { data: rpRows, error: rpErr } = await supabase
          .from("rp_entries")
          .select("*")
          .eq("season_id", (s as Season).id)
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10);

        if (rpErr) throw rpErr;
        setRecent((rpRows ?? []) as RpEntry[]);
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? "Failed to load in-game tracker");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(() => {
    if (!isMember) return false;
    const n = Number(deltaRp);
    if (!Number.isFinite(n)) return false;
    if (!Number.isInteger(n)) return false;
    if (deltaRp.trim() === "") return false;
    // allow negative; block 0 as it's usually accidental
    if (n === 0) return false;
    if (!entryDate) return false;
    return !saving;
  }, [deltaRp, entryDate, isMember, saving]);

  async function refreshRecent(seasonId: string, uid: string) {
    const { data: rpRows, error: rpErr } = await supabase
      .from("rp_entries")
      .select("*")
      .eq("season_id", seasonId)
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(10);

    if (rpErr) throw rpErr;
    setRecent((rpRows ?? []) as RpEntry[]);
  }

  async function onAddRp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!season || !authUserId) return;

    try {
      setSaving(true);

      const n = Number(deltaRp);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n === 0) {
        throw new Error("Delta RP must be a non-zero whole number (e.g. 250 or -45).");
      }

      const { error: insErr } = await supabase.from("rp_entries").insert({
        season_id: season.id,
        user_id: authUserId, // IMPORTANT: self-only; RLS enforces this too
        entry_date: entryDate,
        delta_rp: n,
      });

      if (insErr) throw insErr;

      setDeltaRp("");
      await refreshRecent(season.id, authUserId);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add RP");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="opacity-70">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="uppercase tracking-[0.3em] text-xs text-white/60">Apex Legends</div>
            <h1 className="mt-3 text-4xl font-bold">In-Game Tracker</h1>

            <div className="mt-2 text-sm text-white/70">
              {profile ? (
                <>
                  Signed in as <span className="text-white font-semibold">{profile.display_name}</span>
                </>
              ) : (
                <>Signed in</>
              )}
              {season ? (
                <>
                  {" "}
                  • Active season: <span className="text-white/90">{season.name ?? season.id.slice(0, 8)}</span>
                </>
              ) : null}
              {isHost ? (
                <>
                  {" "}
                  • <span className="text-red-400">Host</span>
                </>
              ) : (
                <>
                  {" "}
                  • <span className="text-white/60">Viewer</span>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10 transition"
            >
              Back
            </Link>
            <Link
              href="/season-progression"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 hover:bg-white/10 transition"
            >
              Season Progression
            </Link>
          </div>
        </div>

        {err && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {/* Membership gate */}
        {!isMember ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="text-lg font-semibold">You’re not a season member yet</div>
            <div className="mt-2 text-sm text-white/70">
              Ask the host to add your <span className="text-white">auth user id</span> to{" "}
              <span className="text-white">season_players</span> for this season.
            </div>

            <div className="mt-4 text-sm">
              Your user id:{" "}
              <span className="font-mono text-white/90">{authUserId ?? "unknown"}</span>
            </div>

            {season && (
              <div className="mt-2 text-sm">
                Season id: <span className="font-mono text-white/90">{season.id}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Add RP */}
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-semibold">Add RP (delta)</div>
              <div className="mt-1 text-sm text-white/70">
                Adds RP for <span className="text-white font-semibold">your username only</span>. Whole numbers. Negative
                allowed.
              </div>

              <form onSubmit={onAddRp} className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <label className="block">
                  <div className="text-sm text-white/70 mb-2">Date</div>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
                  />
                </label>

                <label className="block">
                  <div className="text-sm text-white/70 mb-2">Delta RP</div>
                  <input
                    inputMode="numeric"
                    value={deltaRp}
                    onChange={(e) => setDeltaRp(e.target.value)}
                    placeholder="e.g. 250 or -45"
                    className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
                  />
                </label>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold disabled:opacity-40"
                >
                  {saving ? "Adding…" : "Add RP"}
                </button>
              </form>
            </div>

            {/* Recent entries (verification view) */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-semibold">Your latest RP entries</div>
              <div className="mt-1 text-sm text-white/70">
                This is just a verification panel so you can confirm inserts are working.
              </div>

              {recent.length === 0 ? (
                <div className="mt-4 text-sm text-white/60">No entries yet.</div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead className="bg-black/30 text-white/70">
                      <tr>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Delta</th>
                        <th className="text-left px-4 py-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.id} className="border-t border-white/10">
                          <td className="px-4 py-3 font-mono">{r.entry_date}</td>
                          <td className="px-4 py-3 font-mono">
                            {r.delta_rp > 0 ? `+${r.delta_rp}` : r.delta_rp}
                          </td>
                          <td className="px-4 py-3 font-mono text-white/60">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Host-only controls placeholder */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-semibold">Host Controls</div>
              <div className="mt-1 text-sm text-white/70">
                These will be wired next. Viewers should not be able to use them.
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={!isHost}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 disabled:opacity-40"
                >
                  New Session
                </button>
                <button
                  disabled={!isHost}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 disabled:opacity-40"
                >
                  Add Player
                </button>
                <button
                  disabled={!isHost}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 disabled:opacity-40"
                >
                  Add Win
                </button>
                <button
                  disabled={!isHost}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 disabled:opacity-40"
                >
                  Share Live Link
                </button>
              </div>

              {!isHost && (
                <div className="mt-3 text-xs text-white/50">
                  You’re a viewer. You can add RP for yourself, but host controls are disabled.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
