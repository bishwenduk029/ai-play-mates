import { NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

// POST /api/checkout → { url }
// Creates a Dodo hosted-checkout session for the subscription product and
// returns its URL. The frontend redirects to it.
const client = new DodoPayments({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode",
});

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  const checkout = await client.checkoutSessions.create({
    product_cart: [
      { product_id: process.env.DODO_PAYMENTS_PRODUCT_ID!, quantity: 1 },
    ],
    ...(session?.user?.email
      ? { customer: { email: session.user.email } }
      : {}),
    return_url: process.env.DODO_PAYMENTS_RETURN_URL || "https://ai-play-mates.vercel.app/play",
  });
  return NextResponse.json({ url: checkout.checkout_url });
}
