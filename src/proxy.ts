import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Next.js 16 proxy — protects play routes, leaves public routes open.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = getSessionCookie(request);

  // If on auth pages and already logged in, go to play hub.
  if ((pathname === "/login" || pathname === "/signup") && sessionCookie) {
    return NextResponse.redirect(new URL("/play", request.url));
  }

  // Protected routes — require session cookie.
  const isProtected =
    pathname === "/play" || pathname.startsWith("/mates") || pathname.startsWith("/games");

  if (isProtected && !sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth|characters|.*\\.).*)"],
};
