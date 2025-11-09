import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE!; // server-only

// NOTE: params is now a Promise — await it.
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;            // ✅ await params
    const body = await req.json();                  // { doc: {...} }

    if (!id || !body?.doc) {
      return NextResponse.json({ error: "Missing id or doc" }, { status: 400 });
    }

    const admin = createClient(url, serviceKey);
    const { error } = await admin
      .from("sessions")
      .upsert({ id, doc: body.doc, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
