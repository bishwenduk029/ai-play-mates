import { Webhooks } from "@dodopayments/nextjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";

const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;

// Guard: if webhook key isn't set, return 503 instead of crashing at build.
export const POST = webhookKey
  ? Webhooks({
      webhookKey,
      onPayload: async (event) => {
        console.log("[Dodo] event:", event.type);
      },
      onSubscriptionActive: async (event) => {
        await updateSubscriptionStatus(event.data.customer.email, "active");
      },
      onSubscriptionRenewed: async (event) => {
        await updateSubscriptionStatus(event.data.customer.email, "active");
      },
      onSubscriptionOnHold: async (event) => {
        await updateSubscriptionStatus(event.data.customer.email, "on_hold");
      },
      onSubscriptionFailed: async (event) => {
        await updateSubscriptionStatus(event.data.customer.email, "failed");
      },
    })
  : async () => NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

async function updateSubscriptionStatus(email: string, status: string) {
  try {
    await db.update(user).set({ image: `sub:${status}` }).where(eq(user.email, email));
    console.log(`[Dodo] subscription for ${email} → ${status}`);
  } catch (e) {
    console.error("[Dodo] failed to update status:", e);
  }
}
