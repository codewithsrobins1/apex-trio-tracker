// src/app/api/session/[id]/save/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

// If you're on Next.js 15, params is a Promise; if you're on 14, remove the `await` and use plain { params: { id: string } }.
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "Missing id in URL" }, { status: 400 });
    }

    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Upsert by primary key `id`. We include whatever fields you send in `body`.
    // If your table has `updated_at`, this will populate it.
    const row = { id, ...body, updated_at: new Date().toISOString() };

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from("sessions")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
