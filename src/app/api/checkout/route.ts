import { Checkout } from "@dodopayments/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

/**
 * Dodo Payments hosted checkout (OOB redirect — no custom checkout UI).
 *
 * GET  /api/checkout              → redirect to Dodo's hosted checkout for the
 *                                   subscription product (read from
 *                                   DODO_PAYMENTS_PRODUCT_ID env), pre-filled
 *                                   with the logged-in user's email. Returns
 *                                   to /play.
 * GET  /api/checkout?productId=X  → same, with an explicit product override.
 *
 * The product ID comes from DODO_PAYMENTS_PRODUCT_ID (set in the Dodo dashboard
 * → Products). If missing, returns a 500 with a clear message.
 *
 * The customer email is read from the current better-auth session so the
 * subscription lands on the right Dodo customer (and the webhook can
 * reconcile it to the local user). If there's no session, the checkout still
 * works (Dodo collects the email) but the webhook won't find a local user to
 * attach the subscription to until they sign up with the same email.
 */

const env = (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode";
const returnUrl = process.env.DODO_PAYMENTS_RETURN_URL || "https://ai-play-mates.vercel.app/play";

// Base handler config shared by GET/POST.
function baseConfig() {
  return {
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    environment: env,
    returnUrl,
  };
}

// The OOB Dodo Checkout handler — expects ?productId= in the query string.
const dodoCheckout = Checkout(baseConfig());

/**
 * GET: if no ?productId= query param, redirect to the same path with the
 * product ID from DODO_PAYMENTS_PRODUCT_ID, then hand off to the OOB handler.
 * This lets the UI link to plain /api/checkout without knowing the product ID.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (!url.searchParams.has("productId")) {
    const productId = process.env.DODO_PAYMENTS_PRODUCT_ID;
    if (!productId) {
      return NextResponse.json(
        { error: "DODO_PAYMENTS_PRODUCT_ID is not set. Create a product in the Dodo dashboard." },
        { status: 500 },
      );
    }
    url.searchParams.set("productId", productId);
    return NextResponse.redirect(url);
  }
  return dodoCheckout(req);
}

// Dynamic checkout: injects the logged-in user's email + the product ID so the
// Dodo checkout is pre-filled and the subscription reconciles to the local user.
export async function POST(req: NextRequest) {
  const productId =
    (await req.json().catch(() => ({}))).productId ??
    process.env.DODO_PAYMENTS_PRODUCT_ID;
  if (!productId) {
    return NextResponse.json(
      { error: "DODO_PAYMENTS_PRODUCT_ID is not set. Create a product in the Dodo dashboard." },
      { status: 500 },
    );
  }

  // Read the logged-in user's email so Dodo links the subscription to them.
  let email: string | undefined;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    email = session?.user?.email;
  } catch {
    // No session — Dodo will collect the email on the hosted page.
  }

  // Use the Checkout handler with a session payload (customer + product).
  const handler = Checkout({
    ...baseConfig(),
    type: "session",
  });
  // The handler reads the body; we pass the product cart + customer through.
  return handler(
    new NextRequest(req.url, {
      method: "POST",
      headers: req.headers,
      body: JSON.stringify({
        product_cart: [{ product_id: productId, quantity: 1 }],
        ...(email ? { customer: { email } } : {}),
      }),
    }),
  );
}
