/**
 * Supabase auth & database stub.
 * TODO: Replace mock data layer with Supabase client when backend is ready.
 */

export interface SupabaseUser {
  id: string;
  email: string;
  fullName: string;
}

export async function getCurrentUser(): Promise<SupabaseUser | null> {
  // TODO: supabase.auth.getUser()
  return {
    id: "user-001",
    email: "verwaltung@cura-demo.ch",
    fullName: "Admin Demo",
  };
}

export async function signOut(): Promise<void> {
  // TODO: supabase.auth.signOut()
}
