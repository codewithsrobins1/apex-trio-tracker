"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchMyProfile, upsertProfile, type Profile } from "@/lib/auth/usernameAuth";
import { supabase } from "@/lib/supabase/client";

function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpointPx]);

  return isMobile;
}

export default function HomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const seasonDisabled = isMobile;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const p = await fetchMyProfile();
        if (mounted) setProfile(p);
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? "Failed to load profile");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmit = useMemo(() => name.trim().length >= 2 && !saving, [name, saving]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    try {
      setSaving(true);
      const p = await upsertProfile(name);
      setProfile(p);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save username");
    } finally {
      setSaving(false);
    }
  }

  async function onSwitchUser() {
    setErr(null);
    try {
      // Signing out of anonymous auth gives a clean slate (new user id on next sign-in)
      await supabase.auth.signOut();
      setProfile(null);
      setName("");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to switch user");
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
      <div className="max-w-6xl mx-auto px-6 py-20">
        {/* HERO */}
        <div className="text-center">
          <div className="uppercase tracking-[0.3em] text-xs text-white/60">Apex Legends</div>
          <h1 className="mt-4 text-5xl md:text-6xl font-bold text-red-500">Apex Trio Tracker</h1>

          {!profile ? (
            <p className="mt-4 text-white/70">
              Track your ranked RP progression over time and session performance with your trio.
            </p>
          ) : (
            <>
              <div className="mt-6 text-lg text-white/80">
                Welcome back, <span className="font-semibold text-white">{profile.display_name}</span>
              </div>
              <button
                onClick={onSwitchUser}
                className="mt-2 text-sm text-white/60 underline hover:text-white/80"
              >
                Switch User
              </button>
            </>
          )}
        </div>

        {/* CONTENT */}
        <div className="mt-16 flex justify-center">
          <div className="w-full max-w-5xl">
            {!profile ? (
              // SIGN-IN CARD
              <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 shadow">
                <div className="text-lg font-semibold">Enter Username</div>
                <div className="mt-1 text-sm text-white/70">No email. Just a name to attribute your RP.</div>

                <form className="mt-5 space-y-3" onSubmit={onSubmit}>
                  <label className="block">
                    <div className="text-sm text-white/70 mb-2">Username</div>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="YourGamertag"
                      className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
                      maxLength={24}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  {err && <div className="text-sm text-red-400">{err}</div>}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold disabled:opacity-40"
                  >
                    {saving ? "Saving…" : "Continue"}
                  </button>
                </form>
              </div>
            ) : (
              // CTA CARDS (SIGNED IN)
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Season Progression */}
                {seasonDisabled ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow opacity-60">
                    <div className="h-12 w-12 rounded-xl bg-red-600/20 flex items-center justify-center border border-red-500/30">
                      <div className="h-5 w-5 rounded bg-red-500/80" />
                    </div>

                    <div className="mt-6 text-xl font-semibold">Season Progression</div>
                    <div className="mt-2 text-sm text-white/65 max-w-sm">
                      Track your ranked points over time with detailed graphs and insights
                    </div>

                    <div className="mt-4 text-xs text-white/50">
                      Desktop only (graph is not optimized for mobile yet)
                    </div>
                  </div>
                ) : (
                  <Link
                    href="/season-progression"
                    className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow hover:bg-white/10 transition block"
                  >
                    <div className="h-12 w-12 rounded-xl bg-red-600/20 flex items-center justify-center border border-red-500/30">
                      <div className="h-5 w-5 rounded bg-red-500/80" />
                    </div>

                    <div className="mt-6 text-xl font-semibold">Season Progression</div>
                    <div className="mt-2 text-sm text-white/65 max-w-sm">
                      Track your ranked points over time with detailed graphs and insights
                    </div>
                  </Link>
                )}

                {/* In-Game Tracker */}
                <Link
                  href="/in-game-tracker"
                  className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow hover:bg-white/10 transition block"
                >
                  <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                    <div className="h-5 w-5 rounded bg-white/60" />
                  </div>

                  <div className="mt-6 text-xl font-semibold">In-Game Tracker</div>
                  <div className="mt-2 text-sm text-white/65 max-w-sm">
                    Live session tracking with damage, kills, and performance stats
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER ERROR (optional) */}
        {profile && err && <div className="mt-6 text-center text-sm text-red-400">{err}</div>}
      </div>
    </main>
  );
}
