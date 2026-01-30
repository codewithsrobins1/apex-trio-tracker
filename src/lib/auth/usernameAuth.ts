import { supabase } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
};

export async function getAuthedUser() {
  // getSession() is the correct “am I logged in?” check
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

export async function signInAnonIfNeeded() {
  const user = await getAuthedUser();
  if (user) return user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user) throw new Error("Anonymous sign-in returned no user");
  return data.user;
}

export async function upsertProfile(displayName: string) {
  const user = await signInAnonIfNeeded();

  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: displayName.trim() },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function fetchMyProfile() {
  const user = await getAuthedUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile) ?? null;
}
