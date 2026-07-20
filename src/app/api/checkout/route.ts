import { Checkout } from "@dodopayments/nextjs";

// GET  → static checkout (?productId=...)
// POST → dynamic checkout (with billing/customer data in body)
export const GET = Checkout({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  returnUrl: process.env.DODO_PAYMENTS_RETURN_URL || "https://ai-play-zone.vercel.app/play",
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode",
});

export const POST = Checkout({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
  returnUrl: process.env.DODO_PAYMENTS_RETURN_URL || "https://ai-play-zone.vercel.app/play",
  environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode",
  type: "session",
});
