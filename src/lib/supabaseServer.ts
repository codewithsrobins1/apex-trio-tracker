// src/lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    // This will show up in Vercel Function logs and makes the failure obvious
    throw new Error(
      `Supabase server envs missing. SUPABASE_URL present? ${!!url}. SERVICE_ROLE present? ${!!key}. ` +
      `Remember: set BOTH in Vercel (correct environment: Production/Preview), then redeploy.`
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
