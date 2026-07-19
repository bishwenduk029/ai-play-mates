import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Next.js 16 proxy — protects /play route, leaves public routes open.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  // Public routes — no auth required.
  const publicPaths = ["/", "/landing", "/login", "/signup"];
  const isPublic = publicPaths.includes(pathname);

  // If on auth pages and already logged in, go to play.
  if ((pathname === "/login" || pathname === "/signup") && sessionCookie) {
    return NextResponse.redirect(new URL("/play", request.url));
  }

  // If on landing page (root "/"), leave it public.
  if (pathname === "/") return NextResponse.next();

  // Everything else requires a session cookie.
  if (!isPublic && !sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on all routes except static assets and API auth (better-auth handles its own).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|characters|.*\\.).*)"],
};
