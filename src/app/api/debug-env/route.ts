// src/app/api/debug-env/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    has_SUPABASE_URL: !!process.env.SUPABASE_URL,
    has_SERVICE_ROLE: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    has_PUBLIC_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    has_PUBLIC_ANON: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // Which runtime are we actually on?
    nodeRuntime: "nodejs",
  });
}
