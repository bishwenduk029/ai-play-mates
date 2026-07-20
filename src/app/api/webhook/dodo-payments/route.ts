import { Webhooks } from "@dodopayments/nextjs";
import { db } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";

// Webhook handler for Dodo Payments subscription events.
// Events: subscription.active, subscription.renewed, subscription.on_hold,
//         subscription.failed, payment.succeeded, payment.failed
export const POST = Webhooks({
  webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY!,
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
});

async function updateSubscriptionStatus(email: string, status: string) {
  try {
    await db.update(user).set({ image: `sub:${status}` }).where(eq(user.email, email));
    console.log(`[Dodo] subscription for ${email} → ${status}`);
  } catch (e) {
    console.error("[Dodo] failed to update status:", e);
  }
}
