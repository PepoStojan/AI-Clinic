import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "./lib/auth/session";

// UI-001: the entire access-control model. Every route except /login and
// the login API/static assets requires a valid signed session cookie --
// no user accounts, no Supabase Auth, just the one shared password.

const PUBLIC_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await verifySessionCookieValue(sessionCookie);

  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next's own internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|api/login).*)",
  ],
};
