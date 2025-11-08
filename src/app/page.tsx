"use client";

import { useMemo, useState } from "react";

export default function ApexTrioTracker() {
  type GameEntry = { damage: number; kills: number };
  type Player = {
    id: string;
    name: string;
    damageInput: string;
    killsInput: string;
    games: number; // per-player games (increments with global Add Game)
    totalDamage: number;
    totalKills: number;
    oneKGames: number; // >= 1000 dmg
    twoKGames: number; // >= 2000 dmg
    history: GameEntry[]; // individual history (still used by global undo)
  };

  type GameFrame = {
    entries: { id: string; entry: GameEntry }[]; // one entry per player for a single match
  };

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
    history: [],
  });

  const [players, setPlayers] = useState<Player[]>([makeNewPlayer()]);

  // Session-level trackers
  const [sessionGames, setSessionGames] = useState<number>(0);
  const [gameHistory, setGameHistory] = useState<GameFrame[]>([]); // for global undo

  // Group RP (ranked points) for the whole squad this session
  const [rpInput, setRpInput] = useState<string>("");
  const [totalRP, setTotalRP] = useState<number>(0);
  const [rpHistory, setRpHistory] = useState<number[]>([]);

  // Wins tracker (group-wide)
  const [wins, setWins] = useState<number>(0);
  const [winsHistory, setWinsHistory] = useState<number[]>([]);

  const MAX_PLAYERS = 3;

  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    setPlayers((p) => [...p, makeNewPlayer()]);
  };

  const removePlayer = (id: string) => {
    setPlayers((p) => p.filter((pl) => pl.id !== id));
  };

  const updateField = <K extends keyof Player>(id: string, field: K, value: Player[K]) => {
    setPlayers((prev) => prev.map((pl) => (pl.id === id ? { ...pl, [field]: value } : pl)));
  };

  // ===== Global Add / Undo (applies to everyone) =====
  const addGameAll = () => {
    // Determine if at least one player's inputs are provided; otherwise ignore
    const anyProvided = players.some((p) => (p.damageInput ?? "") !== "" || (p.killsInput ?? "") !== "");
    if (!anyProvided) return;

    const frame: GameFrame = { entries: [] };
    setPlayers((prev) =>
      prev.map((pl) => {
        const dmgRaw = Number(pl.damageInput);
        const kRaw = Number(pl.killsInput);
        const dmg = Number.isFinite(dmgRaw) && dmgRaw >= 0 ? dmgRaw : 0;
        const k = Number.isFinite(kRaw) && kRaw >= 0 ? kRaw : 0;
        frame.entries.push({ id: pl.id, entry: { damage: dmg, kills: k } });
        return {
          ...pl,
          games: pl.games + 1,
          totalDamage: pl.totalDamage + dmg,
          totalKills: pl.totalKills + k,
          oneKGames: pl.oneKGames + (dmg >= 1000 ? 1 : 0),
          twoKGames: pl.twoKGames + (dmg >= 2000 ? 1 : 0),
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
    if (gameHistory.length === 0) return;
    const last = gameHistory[gameHistory.length - 1];
    setPlayers((prev) =>
      prev.map((pl) => {
        const found = last.entries.find((e) => e.id === pl.id);
        if (!found) return pl;
        const { damage, kills } = found.entry;
        return {
          ...pl,
          games: Math.max(0, pl.games - 1),
          totalDamage: Math.max(0, pl.totalDamage - damage),
          totalKills: Math.max(0, pl.totalKills - kills),
          oneKGames: Math.max(0, pl.oneKGames - (damage >= 1000 ? 1 : 0)),
          twoKGames: Math.max(0, pl.twoKGames - (damage >= 2000 ? 1 : 0)),
          // optional: restore inputs to last values for quick re-entry
          damageInput: String(damage || ""),
          killsInput: String(kills || ""),
          history: pl.history.slice(0, -1),
        };
      })
    );
    setSessionGames((g) => Math.max(0, g - 1));
    setGameHistory((h) => h.slice(0, -1));
  };

  // RP controls (group-wide)
  const commitRP = () => {
    const delta = Number(rpInput);
    if (!Number.isFinite(delta) || rpInput === "") return;
    setTotalRP((v) => v + delta);
    setRpHistory((h) => [...h, delta]);
    setRpInput("");
  };
  const undoRP = () => {
    if (rpHistory.length === 0) return;
    const last = rpHistory[rpHistory.length - 1];
    setTotalRP((v) => v - last);
    setRpHistory((h) => h.slice(0, -1));
    setRpInput(String(last));
  };

  // Wins controls (group-wide)
  const addWin = () => {
    setWins((w) => w + 1);
    setWinsHistory((h) => [...h, 1]);
  };
  const undoWin = () => {
    if (winsHistory.length === 0) return;
    setWins((w) => Math.max(0, w - 1));
    setWinsHistory((h) => h.slice(0, -1));
  };

  // Derived averages per player
  const derived = useMemo(() => {
    return players.map((p) => ({
      id: p.id,
      avgDamage: p.games > 0 ? p.totalDamage / p.games : 0,
      avgKills: p.games > 0 ? p.totalKills / p.games : 0,
    }));
  }, [players]);

  // Group-level averages across players with at least one game
  const { groupAvgDamage, groupAvgKills } = useMemo(() => {
    const withGames = players.filter((p) => p.games > 0);
    if (withGames.length === 0)
      return { groupAvgDamage: 0, groupAvgKills: 0 };
    const avgDamage = withGames.reduce((acc, p) => acc + p.totalDamage / p.games, 0) / withGames.length;
    const avgKills = withGames.reduce((acc, p) => acc + p.totalKills / p.games, 0) / withGames.length;
    return { groupAvgDamage: avgDamage, groupAvgKills: avgKills };
  }, [players]);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 px-4 py-8">
      <div className="mx-auto max-w-[1300px]">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Apex Stats – Trio Tracker</h1>
            <p className="text-sm text-neutral-500">
              Use the Data Entry panel to input each player's stats, then click <em>Add Game (All Rows)</em>.
              RP & Wins are tracked for the whole squad.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={addPlayer}
              disabled={players.length >= MAX_PLAYERS}
              className="rounded-2xl px-4 py-2 shadow-sm border border-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow transition"
              title={players.length >= MAX_PLAYERS ? "Max 3 players" : "Add another player"}
            >
              + Add Player
            </button>
            <button
              onClick={() => {
                setPlayers([makeNewPlayer()]);
                setSessionGames(0);
                setGameHistory([]);
                setTotalRP(0);
                setRpHistory([]);
                setWins(0);
                setWinsHistory([]);
              }}
              className="rounded-2xl px-4 py-2 shadow-sm border border-neutral-200 hover:shadow transition"
              title="Reset to a single empty row & clear session"
            >
              New Session
            </button>
          </div>
        </header>

        {/* KPI cards */}
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Players</div>
            <div className="text-xl font-semibold">{players.length}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Session Games</div>
            <div className="text-xl font-semibold">{sessionGames}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Group Avg Damage</div>
            <div className="text-xl font-semibold">{groupAvgDamage.toFixed(0)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Group Avg Kills</div>
            <div className="text-xl font-semibold">{groupAvgKills.toFixed(1)}</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Total RP / Wins</div>
            <div className="text-xl font-semibold">{totalRP} / {wins}</div>
          </div>
        </section>

        {/* Data Entry panel */}
        <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-neutral-700">Data Entry</h2>
          <div className="grid gap-3">
            {players.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-12 items-center">
                <div className="sm:col-span-1 text-neutral-500">#{idx + 1}</div>
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updateField(p.id, "name", e.target.value)}
                    placeholder="Player name"
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
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
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
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
                    className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
                  />
                </div>
                <div className="sm:col-span-2">
                  {players.length > 1 && (
                    <button
                      onClick={() => removePlayer(p.id)}
                      className="w-full rounded-xl border border-neutral-200 px-2 py-2 text-xs text-neutral-600 hover:shadow-sm"
                      title="Remove player"
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
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-700 hover:shadow-sm"
              title="Commit current inputs for all players as one game"
            >
              Add Game (All Rows) ▶
            </button>
            <button
              onClick={undoGameAll}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm text-neutral-700 hover:shadow-sm disabled:opacity-50"
              disabled={gameHistory.length === 0}
              title="Undo the last added game for all players"
            >
              ◀ Undo Last Game
            </button>
          </div>
        </section>

        {/* RP & Wins Controls (group-wide) */}
        <section className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">
                Ranked Points (RP) — Session Total: <span className="font-semibold">{totalRP}</span>
                <span className="ml-3">Wins: <span className="font-semibold">{wins}</span></span>
              </div>
              <p className="text-xs text-neutral-500">Enter RP change per match (can be negative). Use buttons to track wins.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={rpInput}
                onChange={(e) => setRpInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitRP(); }}
                placeholder="e.g. 45 or -23"
                className="w-40 rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
              />
              <button
                onClick={commitRP}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 hover:shadow-sm"
                title="Add this RP delta to session total"
              >
                Add RP ▶
              </button>
              <button
                onClick={undoRP}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 hover:shadow-sm disabled:opacity-50"
                disabled={rpHistory.length === 0}
                title="Undo last RP add"
              >
                ◀ Undo RP
              </button>

              <div className="mx-2 h-6 w-px bg-neutral-200" />

              <button
                onClick={addWin}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 hover:shadow-sm"
                title="Increment wins"
              >
                +1 Win
              </button>
              <button
                onClick={undoWin}
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 hover:shadow-sm disabled:opacity-50"
                disabled={winsHistory.length === 0}
                title="Undo last win"
              >
                ◀ Undo Win
              </button>
            </div>
          </div>
        </section>

        {/* Player Stats table */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 w-[44px]">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Games</th>
                <th className="px-4 py-3">Total Damage</th>
                <th className="px-4 py-3">Total Kills</th>
                <th className="px-4 py-3">1k Games</th>
                <th className="px-4 py-3">2k Games</th>
                <th className="px-4 py-3">Avg Damage</th>
                <th className="px-4 py-3">Avg Kills</th>
                <th className="px-4 py-3 w-[1%]"></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, idx) => {
                const avgs = derived.find((d) => d.id === p.id)!;
                return (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 text-neutral-500">{idx + 1}</td>
                    <td className="px-4 py-3">{p.name || "—"}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.games}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.totalDamage}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.totalKills}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.oneKGames}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.twoKGames}</td>
                    <td className="px-4 py-3 text-neutral-700">{avgs.avgDamage.toFixed(1)}</td>
                    <td className="px-4 py-3 text-neutral-700">{avgs.avgKills.toFixed(1)}</td>
                    <td className="px-4 py-3">
                      {players.length > 1 && (
                        <button
                          onClick={() => removePlayer(p.id)}
                          className="rounded-xl border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:shadow-sm"
                          title="Remove player"
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
              <tr className="border-t border-neutral-200 bg-neutral-50 font-semibold">
                <td className="px-4 py-3 text-neutral-600">—</td>
                <td className="px-4 py-3 text-neutral-600">Totals/Avg</td>
                <td className="px-4 py-3">{/* sum of player games */}
                  {players.reduce((acc, p) => acc + p.games, 0)}
                </td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.totalDamage, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.totalKills, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.oneKGames, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.twoKGames, 0)}</td>
                <td className="px-4 py-3">{groupAvgDamage.toFixed(1)}</td>
                <td className="px-4 py-3">{groupAvgKills.toFixed(2)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Workflows: Enter all player stats in the Data Entry panel → <em>Add Game (All Rows)</em> to commit. Use <em>Undo Last Game</em> to revert the previous commit. RP supports negatives, Wins increments by 1.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={async () => {
              const lines: string[] = [];
              lines.push(`**Apex Session Summary**`);
              lines.push(`Games recorded: ${sessionGames}`);
              lines.push(`Total RP: ${totalRP} | Wins: ${wins}`);
              lines.push("");
              players.forEach((p, i) => {
                const avgD = p.games > 0 ? (p.totalDamage / p.games).toFixed(0) : "0";
                const avgK = p.games > 0 ? (p.totalKills / p.games).toFixed(1) : "0.0";
                lines.push(
                  `#${i + 1} ${p.name || "(no name)"} — Games: ${p.games}, Total Dmg: ${p.totalDamage}, Total K: ${p.totalKills}, 1k: ${p.oneKGames}, 2k: ${p.twoKGames}, Avg Dmg: ${avgD}, Avg K: ${avgK}`
                );
              });
              lines.push("");
              lines.push(`Group Avg — Damage: ${groupAvgDamage.toFixed(0)}, Kills: ${groupAvgKills.toFixed(1)}, Total RP: ${totalRP}, Wins: ${wins}`);

              const content = lines.join("\n");
              try {
                const res = await fetch("/api/discord", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                });
                if (!res.ok) throw new Error(await res.text());
                alert("Posted session to Discord ✅");
              } catch (err: unknown) {
                console.error(err);
                const msg = err instanceof Error ? err.message : String(err);
                alert(`Failed to post to Discord. ${msg ? `Details: ${msg}` : "Check server logs & .env."} ❌`);
              }
            }}
            className="rounded-2xl border border-neutral-200 px-4 py-2 text-sm hover:shadow transition"
            title="Send the current session's summary to your Discord channel"
          >
            Post Session to Discord
          </button>
          <span className="text-xs text-neutral-500">Configure /api/discord server route with a webhook (Option A) in .env.local</span>
        </div>
      </div>
    </main>
  );
}


// ==============================
// FILE: app/api/discord/route.ts
// Option A: Webhook-based posting
// ==============================
// Place this file at app/api/discord/route.ts
// Requires: DISCORD_WEBHOOK_URL in .env.local

export const dynamic = "force-dynamic"; // ensure no caching in vercel-like hosts

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { content } = await req.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Missing 'content' string" }, { status: 400 });
    }

    const url = process.env.DISCORD_WEBHOOK_URL;
    if (!url) {
      return NextResponse.json({ error: "Missing DISCORD_WEBHOOK_URL env var" }, { status: 500 });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text || "Discord webhook error" }, { status: res.status });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
