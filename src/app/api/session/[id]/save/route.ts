// app/api/session/[id]/save/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const writeKey = req.headers.get("x-write-key");

  if (!writeKey) {
    return NextResponse.json({ error: "Missing write key" }, { status: 401 });
  }

  const { data: sessionRow, error: fetchErr } = await supabase
    .from("sessions")
    .select("write_key")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!sessionRow || sessionRow.write_key !== writeKey) {
    return NextResponse.json({ error: "Invalid write key" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const { error: updateErr } = await supabase
    .from("sessions")
    .update({
      doc: body.doc ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
