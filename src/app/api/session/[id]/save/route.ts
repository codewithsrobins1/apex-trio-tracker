import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params; // Next 15 requires awaiting params
    const body = await req.json(); // { doc: {...} }

    if (!id || !body?.doc) {
      return NextResponse.json({ error: "Missing id or doc" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // assumes table "sessions" with columns: id (uuid/text pk), doc (jsonb), updated_at (timestamptz)
    const { error } = await supabase
      .from("sessions")
      .upsert(
        { id, doc: body.doc, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
