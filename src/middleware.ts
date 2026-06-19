import { NextResponse, type NextRequest } from "next/server";

import {
  COOKIE_NAME,
  verifyAdminSessionToken,
} from "@/lib/admin/session-edge";
import { updateSession } from "@/lib/supabase/middleware";

/** Routes reachable without a Supabase user session. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/passwort-vergessen",
  "/passwort-zuruecksetzen",
  "/auth/callback",
  "/admin/login",
  "/api/webhooks",
  "/api/agent-tools",
  "/api/admin/login",
  "/api/auth/signup",
  "/api/demo",
  "/api/billing/stripe-return",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAdminArea(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") || pathname.startsWith("/api/admin")
  );
}

function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/api/admin/login";
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ── Admin area (separate from Supabase user auth) ─────────────────────────
  if (isAdminArea(path)) {
    if (isAdminLoginPath(path)) {
      return NextResponse.next();
    }

    const adminToken = req.cookies.get(COOKIE_NAME)?.value;
    const isAdmin = await verifyAdminSessionToken(adminToken);

    if (!isAdmin) {
      if (path.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // ── Regular app (Supabase session) ────────────────────────────────────────
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.next();
  }

  const { response, isAuthed } = await updateSession(req);

  if (isAuthed && path === "/") {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = "/anrufe";
    return NextResponse.redirect(dashboardUrl);
  }

  if (isAuthed || isPublic(path) || path === "/") {
    return response;
  }

  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  const returnPath = `${path}${req.nextUrl.search}`;
  if (returnPath !== "/login") {
    loginUrl.searchParams.set("next", returnPath);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.).*)"],
};
