// app/api/post-session/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function randomKey(len = 40) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const sessionId = crypto.randomUUID();
    const writeKey = randomKey();

    const { error } = await supabase.from("sessions").insert({
      id: sessionId,
      season_number: body.seasonNumber,
      write_key: writeKey,
      doc: body.doc ?? {},
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      sessionId,
      writeKey,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to create session" },
      { status: 400 }
    );
  }
}
