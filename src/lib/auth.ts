import { supabase } from '@/lib/supabase/client';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
};

// Convert username to fake email for Supabase Auth
function usernameToEmail(username: string): string {
  return `${username.toLowerCase().trim()}@apex.local`;
}

/**
 * Register a new user with username + password
 */
export async function register(
  username: string,
  password: string,
  displayName: string
): Promise<Profile> {
  const email = usernameToEmail(username);

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    // Handle "user already exists" case
    if (authError.message.includes('already registered')) {
      throw new Error('Username already taken. Try a different one.');
    }
    throw authError;
  }

  if (!authData.user) {
    throw new Error('Registration failed. Please try again.');
  }

  // 2. Create profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authData.user.id,
      username: username.toLowerCase().trim(),
      display_name: displayName.trim(),
    })
    .select()
    .single();

  if (profileError) {
    // If profile creation fails, we should clean up the auth user
    // But for simplicity, just throw the error
    throw new Error('Failed to create profile: ' + profileError.message);
  }

  return profile as Profile;
}

/**
 * Login with username + password
 */
export async function login(
  username: string,
  password: string
): Promise<Profile> {
  const email = usernameToEmail(username);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message.includes('Invalid login')) {
      throw new Error('Invalid username or password.');
    }
    throw error;
  }

  if (!data.user) {
    throw new Error('Login failed. Please try again.');
  }

  // Fetch profile
  const profile = await fetchMyProfile();
  if (!profile) {
    throw new Error('Profile not found. Please contact admin.');
  }

  return profile;
}

/**
 * Logout current user
 */
export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get current auth user ID (or null if not logged in)
 */
export async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Fetch current user's profile
 */
export async function fetchMyProfile(): Promise<Profile | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile) ?? null;
}

/**
 * Fetch all profiles (for adding players to session)
 */
export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('display_name');

  if (error) throw error;
  return (data as Profile[]) ?? [];
}

/**
 * Listen for auth state changes
 */
export function onAuthStateChange(
  callback: (userId: string | null) => void
): () => void {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(session?.user?.id ?? null);
  });

  return () => subscription.unsubscribe();
}
