import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client bound to the request cookies. Use in Server Components and
 * Route Handlers. Reads the signed-in user via the session cookie and enforces
 * Row Level Security as that user.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component without a mutable cookie store.
            // The middleware refreshes the session, so this can be ignored.
          }
        },
      },
    }
  );
}

/** Returns the currently signed-in user's id, or null. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Like getCurrentUserId but throws — for routes that require a session. */
export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) throw new Error("UNAUTHENTICATED");
  return id;
}
