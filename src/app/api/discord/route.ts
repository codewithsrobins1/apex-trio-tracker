// src/app/api/discord/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body = {
  seasonId?: string;
  postDate?: string; // YYYY-MM-DD
  content?: string; // session summary text from client (keeps your current session info)
  summaryText?: string; // optional extra text (stored in session_posts.summary_text)
};

function isoToday(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function formatDelta(n: number) {
  return n > 0 ? `+${n}` : `${n}`; // include + for positive
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceRole = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    // --- Auth: require Bearer token (avoids cookie/session issues) ---
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!jwt) {
      return NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    // Validate JWT to get posterId
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authErr } = await authClient.auth.getUser(jwt);
    if (authErr) return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });

    const posterId = authData.user?.id;
    if (!posterId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Body;

    const postDate =
      typeof body.postDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.postDate)
        ? body.postDate
        : isoToday();

    // Service-role admin for DB writes
    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

    // Determine seasonId
    let seasonId = typeof body.seasonId === "string" ? body.seasonId : "";
    if (seasonId && !isUuid(seasonId)) {
      return NextResponse.json({ error: "Invalid seasonId" }, { status: 400 });
    }

    if (!seasonId) {
      const { data: s, error: seasonErr } = await admin
        .from("seasons")
        .select("id, host_user_id, season_number")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (seasonErr) throw seasonErr;
      if (!s?.id) return NextResponse.json({ error: "No active season found" }, { status: 400 });
      seasonId = s.id;
    }

    // Load season + verify host
    const { data: season, error: seasonErr2 } = await admin
      .from("seasons")
      .select("id, host_user_id, season_number")
      .eq("id", seasonId)
      .maybeSingle();

    if (seasonErr2) throw seasonErr2;
    if (!season?.id) return NextResponse.json({ error: "Season not found" }, { status: 404 });

    if (season.host_user_id !== posterId) {
      return NextResponse.json({ error: "Only the season host can post to Discord" }, { status: 403 });
    }

    // Load players in join order
    const { data: players, error: playersErr } = await admin
      .from("season_players")
      .select("user_id, joined_at")
      .eq("season_id", seasonId)
      .order("joined_at", { ascending: true });

    if (playersErr) throw playersErr;
    if (!players || players.length === 0) {
      return NextResponse.json({ error: "No players found for season" }, { status: 400 });
    }

    const userIds = players.map((p) => p.user_id);

    // Load profiles for display names
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    if (profErr) throw profErr;

    const nameById = new Map<string, string>((profiles ?? []).map((p) => [p.id, p.display_name]));

    // Load unposted rp_entries for this date (draft deltas)
    const { data: draftEntries, error: draftErr } = await admin
      .from("rp_entries")
      .select("id, user_id, delta_rp")
      .eq("season_id", seasonId)
      .eq("entry_date", postDate)
      .is("posted_at", null);

    if (draftErr) throw draftErr;

    const deltaByUser = new Map<string, number>();
    for (const uid of userIds) deltaByUser.set(uid, 0); // default 0 if no entry

    for (const e of draftEntries ?? []) {
      if (typeof e.user_id === "string") {
        const d = Number((e as any).delta_rp) || 0;
        deltaByUser.set(e.user_id, (deltaByUser.get(e.user_id) ?? 0) + d);
      }
    }

    // Create session_posts commit record
    const sessionPostId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const { error: postErr } = await admin.from("session_posts").insert({
      id: sessionPostId,
      season_id: seasonId,
      host_user_id: posterId,
      posted_at: nowIso,
      // store either summaryText or content (summaryText preferred, content fallback)
      summary_text:
        typeof body.summaryText === "string"
          ? body.summaryText
          : typeof body.content === "string"
          ? body.content
          : null,
    });

    if (postErr) throw postErr;

    // Insert session_rp_deltas + season_rp_snapshots (committed)
    const deltasRows = userIds.map((uid) => ({
      id: crypto.randomUUID(),
      session_post_id: sessionPostId,
      season_id: seasonId,
      user_id: uid,
      delta_rp: deltaByUser.get(uid) ?? 0,
      created_at: nowIso,
    }));

    const snapshotsRows = userIds.map((uid) => ({
      id: crypto.randomUUID(),
      season_id: seasonId,
      user_id: uid,
      post_date: postDate,
      delta_rp: deltaByUser.get(uid) ?? 0,
      posted_at: nowIso,
      posted_by: posterId,
      posted_session_id: sessionPostId,
      snapshot_date: postDate,
    }));

    const { error: deltasErr } = await admin.from("session_rp_deltas").insert(deltasRows);
    if (deltasErr) throw deltasErr;

    const { error: snapErr } = await admin.from("season_rp_snapshots").insert(snapshotsRows);
    if (snapErr) throw snapErr;

    // Mark rp_entries as posted (only those we just consumed)
    if (draftEntries && draftEntries.length > 0) {
      const entryIds = draftEntries.map((e) => e.id);
      const { error: markErr } = await admin
        .from("rp_entries")
        .update({
          posted_at: nowIso,
          posted_by: posterId,
          posted_session_id: sessionPostId,
        })
        .in("id", entryIds);

      if (markErr) throw markErr;
    }

    // ---- Discord content ----
    // Keep existing session summary text from client, and append RP gains section.
    const baseContent =
      typeof body.content === "string" && body.content.trim().length > 0
        ? body.content.trim()
        : typeof body.summaryText === "string" && body.summaryText.trim().length > 0
        ? body.summaryText.trim()
        : `**Apex Session Summary**\nSeason: ${season.season_number}\nDate: ${postDate}`;

    const rpLines = players.map((p, idx) => {
      const name = nameById.get(p.user_id) ?? p.user_id;
      const d = deltaByUser.get(p.user_id) ?? 0;
      return `#${idx + 1} ${name} — RP gained: ${formatDelta(d)}`;
    });

    const finalContent = [baseContent, "", "**RP Gains**", ...rpLines].join("\n");

    // Post to Discord webhook
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) {
      return NextResponse.json(
        { ok: true, warning: "DISCORD_WEBHOOK_URL not set; committed deltas & snapshots were saved." },
        { status: 200 }
      );
    }

    const discordRes = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: finalContent }),
    });

    if (!discordRes.ok) {
      const t = await discordRes.text().catch(() => "");
      return NextResponse.json({ error: t || "Discord post failed" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, sessionPostId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
