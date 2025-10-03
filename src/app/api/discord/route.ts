// app/api/discord/route.ts
import { NextResponse } from "next/server";

// Prevent Next.js from caching the route response
export const dynamic = "force-dynamic";

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
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
