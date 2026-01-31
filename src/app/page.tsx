/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

function normalizeInt(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n > 9999) return null;
  return n;
}

export default function Home() {
  const router = useRouter();
  const search = useSearchParams();

  const [booting, setBooting] = useState(true);
  const [signedInName, setSignedInName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // season input (numbers only)
  const [seasonInput, setSeasonInput] = useState<string>(() => {
    if (typeof window === "undefined") return "27";
    return localStorage.getItem("apex:seasonNumber") ?? "27";
  });

  // join by ID
  const [joinId, setJoinId] = useState<string>("");

  const seasonNumber = useMemo(() => normalizeInt(seasonInput), [seasonInput]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setErr(null);

        // Show username if you have profiles table + anon auth already
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user?.id ?? null;

        if (uid) {
          const { data: p } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", uid)
            .maybeSingle();

          if (!active) return;
          if (p?.display_name) setSignedInName(p.display_name);
        }

        // Optional: if user visits /?s=<sessionId>, auto-join
        const s = search.get("s");
        if (s) {
          router.push(`/in-game-tracker?s=${encodeURIComponent(s)}`);
          return;
        }
      } catch (e: any) {
        if (active) setErr(e?.message ?? "Failed to load");
      } finally {
        if (active) setBooting(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router, search]);

  function persistSeason() {
    if (seasonNumber == null) {
      setErr("Season must be a whole number (e.g. 27).");
      return false;
    }
    localStorage.setItem("apex:seasonNumber", String(seasonNumber));
    return true;
  }

  async function startSession() {
    setErr(null);
    if (!persistSeason()) return;

    try {
      const res = await fetch("/api/post-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonNumber,
          doc: {
            // minimal initial doc; tracker page owns schema
            players: [],
            sessionGames: 0,
            wins: 0,
          },
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to create session");

      const sessionId = json.sessionId as string;
      const writeKey = json.writeKey as string;

      if (!sessionId || !writeKey) throw new Error("Missing sessionId/writeKey from server");

      // this is the entire host/viewer system
      localStorage.setItem(`apex:session:${sessionId}:writeKey`, writeKey);

      router.push(`/in-game-tracker?s=${encodeURIComponent(sessionId)}`);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to start session");
    }
  }

  function joinSession() {
    setErr(null);
    const id = joinId.trim();
    if (!id) {
      setErr("Paste a session id.");
      return;
    }
    router.push(`/in-game-tracker?s=${encodeURIComponent(id)}`);
  }

  const card = "w-full max-w-[780px] rounded-2xl border border-[#2A2E32] bg-[#121418] p-6 shadow-sm";
  const title = "text-4xl sm:text-6xl font-extrabold tracking-tight text-[#E03A3E]";
  const btnPrimary =
    "cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#E03A3E] bg-[#E03A3E] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#B71C1C] hover:border-[#B71C1C] transition disabled:opacity-50 disabled:cursor-not-allowed";
  const btnGhost =
    "cursor-pointer inline-flex items-center justify-center rounded-xl border border-[#2A2E32] bg-[#181B1F] px-4 py-3 text-sm font-semibold text-slate-200 shadow-sm hover:bg-[#20242A] hover:border-[#E03A3E] transition disabled:opacity-50 disabled:cursor-not-allowed";

  if (booting) {
    return (
      <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
        <div className="text-sm text-slate-400">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050608] text-slate-100 px-4 py-10 grid place-items-center">
      <div className="w-full max-w-[900px]">
        <div className="text-center mb-6">
          <div className="uppercase tracking-[0.35em] text-[10px] text-slate-500 mb-2">Apex Legends</div>
          <h1 className={title}>Apex Trio Tracker</h1>
          <p className="mt-3 text-sm text-slate-400">
            {signedInName ? (
              <>
                You’re signed in as <span className="text-slate-100 font-semibold">{signedInName}</span>.
              </>
            ) : (
              <>Choose a season and start a session.</>
            )}
          </p>
        </div>

        <div className="mx-auto grid place-items-center">
          <div className={card}>
            {err && <div className="mb-3 text-sm text-red-300">{err}</div>}

            <div className="grid gap-4">
              {/* Season number */}
              <div className="rounded-xl border border-[#2A2E32] bg-[#181B1F] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
                  Current Season Number
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={seasonInput}
                    onChange={(e) => setSeasonInput(e.target.value)}
                    onBlur={() => {
                      setErr(null);
                      persistSeason();
                    }}
                    placeholder="e.g. 27"
                    inputMode="numeric"
                    className="w-full sm:w-40 rounded-xl border border-[#2A2E32] bg-[#0E1115] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E]"
                  />

                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() => {
                      setErr(null);
                      if (persistSeason()) setErr(null);
                    }}
                    title="Save season number for this browser"
                  >
                    Save Season
                  </button>

                  <div className="text-[11px] text-slate-500">
                    Seasons are just numbers (27, 28, …). Stored locally in this browser.
                  </div>
                </div>
              </div>

              {/* Start session */}
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className={btnPrimary} onClick={startSession} disabled={seasonNumber == null}>
                  Start Session (Host)
                </button>

                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => router.push("/season-progression")}
                  title="Go to the season progression graph"
                >
                  Season Progression
                </button>
              </div>

              {/* Join session */}
              <div className="rounded-xl border border-[#2A2E32] bg-[#181B1F] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mb-2">
                  Join a Session (Viewer)
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    placeholder="Paste session id"
                    className="w-full rounded-xl border border-[#2A2E32] bg-[#0E1115] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#E03A3E] focus:ring-1 focus:ring-[#E03A3E]"
                  />
                  <button type="button" className={btnGhost} onClick={joinSession}>
                    Join
                  </button>
                </div>

                <div className="mt-2 text-[11px] text-slate-500">
                  Viewers can watch, but cannot save without the write key (only host has it).
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                className="cursor-pointer text-[11px] text-slate-300 hover:text-white underline underline-offset-4"
                onClick={async () => {
                  setErr(null);
                  try {
                    await supabase.auth.signOut();
                  } catch {}
                  setSignedInName(null);
                }}
                title="Sign out"
              >
                Sign out
              </button>

              <div className="text-[11px] text-slate-500">Host is determined by writeKey in localStorage.</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
