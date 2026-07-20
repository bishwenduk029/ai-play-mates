import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isPremium } from "@/lib/subscription";

/**
 * GET /api/subscription/status
 * Returns { premium: boolean } for the logged-in user. Used by the
 * SubscriptionButton to decide Upgrade vs Manage.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ premium: false }, { status: 401 });
  }
  const premium = await isPremium(session.user.id);
  return NextResponse.json({ premium });
}
