"use client";

import { useMemo, useState } from "react";

export default function ApexTrioTracker() {
  type GameEntry = { damage: number; kills: number };
  type Player = {
    id: string;
    name: string;
    damageInput: string;
    killsInput: string;
    games: number;
    totalDamage: number;
    totalKills: number;
    history: GameEntry[];
  };

  const makeNewPlayer = (): Player => ({
    id: crypto.randomUUID(),
    name: "",
    damageInput: "",
    killsInput: "",
    games: 0,
    totalDamage: 0,
    totalKills: 0,
    history: [],
  });

  const [players, setPlayers] = useState<Player[]>([makeNewPlayer()]);
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

  const commitCurrentGame = (id: string) => {
    setPlayers((prev) =>
      prev.map((pl) => {
        if (pl.id !== id) return pl;
        const dmg = Number(pl.damageInput);
        const k = Number(pl.killsInput);
        const validDmg = Number.isFinite(dmg) && dmg >= 0 ? dmg : 0;
        const validKills = Number.isFinite(k) && k >= 0 ? k : 0;
        if ((pl.damageInput ?? "") === "" && (pl.killsInput ?? "") === "") return pl;
        const entry: GameEntry = { damage: validDmg, kills: validKills };
        return {
          ...pl,
          games: pl.games + 1,
          totalDamage: pl.totalDamage + validDmg,
          totalKills: pl.totalKills + validKills,
          damageInput: "",
          killsInput: "",
          history: [...pl.history, entry],
        };
      })
    );
  };

  const undoLastGame = (id: string) => {
    setPlayers((prev) =>
      prev.map((pl) => {
        if (pl.id !== id) return pl;
        if (pl.history.length === 0) return pl;
        const last = pl.history[pl.history.length - 1];
        return {
          ...pl,
          games: Math.max(0, pl.games - 1),
          totalDamage: Math.max(0, pl.totalDamage - last.damage),
          totalKills: Math.max(0, pl.totalKills - last.kills),
          damageInput: String(last.damage ?? ""),
          killsInput: String(last.kills ?? ""),
          history: pl.history.slice(0, -1),
        };
      })
    );
  };

  const derived = useMemo(() => {
    return players.map((p) => ({
      id: p.id,
      avgDamage: p.games > 0 ? p.totalDamage / p.games : 0,
      avgKills: p.games > 0 ? p.totalKills / p.games : 0,
    }));
  }, [players]);

  const { groupAvgDamage, groupAvgKills } = useMemo(() => {
    const withGames = players.filter((p) => p.games > 0);
    if (withGames.length === 0) return { groupAvgDamage: 0, groupAvgKills: 0 };
    const avgDamage = withGames.reduce((acc, p) => acc + p.totalDamage / p.games, 0) / withGames.length;
    const avgKills = withGames.reduce((acc, p) => acc + p.totalKills / p.games, 0) / withGames.length;
    return { groupAvgDamage: avgDamage, groupAvgKills: avgKills };
  }, [players]);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 px-4 py-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Apex Stats – Trio Tracker</h1>
            <p className="text-sm text-neutral-500">
              Enter damage & kills for a game, then press <kbd className="rounded border px-1">Enter</kbd> or click <em>Add</em> to commit to totals. Add up to 3 players.
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
              onClick={() => setPlayers([makeNewPlayer()])}
              className="rounded-2xl px-4 py-2 shadow-sm border border-neutral-200 hover:shadow transition"
              title="Reset to a single empty row"
            >
              Reset
            </button>
          </div>
        </header>

        {/* KPI cards */}
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Players</div>
            <div className="text-xl font-semibold">{players.length}</div>
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
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Hint</div>
            <div className="text-sm text-neutral-600">Hit Enter or the Add button to record a game for that row. Use Undo to revert the last add.</div>
          </div>
        </section>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-4 py-3 w-[44px]">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Damage (input)</th>
                <th className="px-4 py-3">Kills (input)</th>
                <th className="px-4 py-3 w-[1%]"></th>
                <th className="px-4 py-3">Games</th>
                <th className="px-4 py-3">Total Damage</th>
                <th className="px-4 py-3">Total Kills</th>
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
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateField(p.id, "name", e.target.value)}
                        placeholder="Player name"
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        value={p.damageInput}
                        onChange={(e) => updateField(p.id, "damageInput", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitCurrentGame(p.id);
                        }}
                        placeholder="e.g. 1200"
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        inputMode="numeric"
                        type="number"
                        min={0}
                        value={p.killsInput}
                        onChange={(e) => updateField(p.id, "killsInput", e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitCurrentGame(p.id);
                        }}
                        placeholder="e.g. 3"
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:ring-2 focus:ring-neutral-200"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => commitCurrentGame(p.id)}
                          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 hover:shadow-sm"
                          title="Add this game's inputs to totals"
                        >
                          Add ▶
                        </button>
                        <button
                          onClick={() => undoLastGame(p.id)}
                          className="rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 hover:shadow-sm disabled:opacity-50"
                          title="Undo the last added game"
                          disabled={p.history.length === 0}
                        >
                          ◀ Undo
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-neutral-700">{p.games}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.totalDamage}</td>
                    <td className="px-4 py-3 text-neutral-700">{p.totalKills}</td>
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
                <td className="px-4 py-3 text-neutral-600">—</td>
                <td className="px-4 py-3 text-neutral-600">—</td>
                <td className="px-4 py-3 text-neutral-600">—</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.games, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.totalDamage, 0)}</td>
                <td className="px-4 py-3">{players.reduce((acc, p) => acc + p.totalKills, 0)}</td>
                <td className="px-4 py-3">{groupAvgDamage.toFixed(1)}</td>
                <td className="px-4 py-3">{groupAvgKills.toFixed(2)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Workflows: Type numbers → press Enter (or <em>Add ▶</em>) per row to record a game. Use <em>◀ Undo</em> to revert the last add (restores values to the inputs). Averages are per player (totals ÷ games). Group averages are the mean of player averages with at least one game.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={async () => {
              const lines: string[] = [];
              lines.push(`**Apex Session Summary**`);
              const totalGames = players.reduce((a, p) => a + p.games, 0);
              lines.push(`Games recorded: ${totalGames}`);
              lines.push("");
              players.forEach((p, i) => {
                const avgD = p.games > 0 ? (p.totalDamage / p.games).toFixed(0) : "0";
                const avgK = p.games > 0 ? (p.totalKills / p.games).toFixed(1) : "0.0";
                lines.push(
                  `#${i + 1} ${p.name || "(no name)"} — Games: ${p.games}, Total Dmg: ${p.totalDamage}, Total K: ${p.totalKills}, Avg Dmg: ${avgD}, Avg K: ${avgK}`
                );
              });
              lines.push("");
              lines.push(`Group Avg — Damage: ${groupAvgDamage.toFixed(0)}, Kills: ${groupAvgKills.toFixed(1)}`);

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
