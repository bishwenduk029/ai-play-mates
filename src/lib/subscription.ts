// Subscription access helpers — single source of truth for "is this user
// premium?". Shared by the webhook (writes status) and route handlers / pages
// (read status). Keeps the Dodo↔local-user reconciliation in one place.

import { db } from "@/lib/auth";
import { subscription, user } from "@/db/auth-schema";
import { eq, desc } from "drizzle-orm";

/** Subscription statuses Dodo sends that grant premium access. */
const ACTIVE_STATUSES = new Set(["active", "renewed"]);

/** True if the user has an active (premium-granting) subscription. */
export async function isPremium(userId: string): Promise<boolean> {
  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .orderBy(desc(subscription.updatedAt))
    .limit(1);
  return rows.length > 0 && ACTIVE_STATUSES.has(rows[0].status);
}

/**
 * Upsert a subscription row from a Dodo webhook event. Reconciles to the local
 * user by email (the only stable id we have at checkout time). Stores the Dodo
 * customer + subscription IDs so future events stay linked even if the email
 * changes.
 */
export async function upsertSubscription(opts: {
  email: string;
  dodoCustomerId: string;
  dodoSubscriptionId: string;
  productId?: string;
  status: string;
}): Promise<void> {
  const { email, dodoCustomerId, dodoSubscriptionId, productId, status } = opts;

  // Find the local user by email.
  const u = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (u.length === 0) {
    // User not found yet — they may not have completed signup. Log and bail;
    // a later event (or their signup) can reconcile. The Dodo IDs are the
    // durable link, but we need a local user row to attach to.
    console.warn(
      `[Dodo] no local user for ${email}; subscription ${dodoSubscriptionId} not recorded`,
    );
    return;
  }
  const userId = u[0].id;

  // Upsert by dodoSubscriptionId (unique).
  const existing = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(eq(subscription.dodoSubscriptionId, dodoSubscriptionId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(subscription)
      .set({ status, productId: productId ?? null, dodoCustomerId, userId })
      .where(eq(subscription.id, existing[0].id));
  } else {
    await db.insert(subscription).values({
      id: crypto.randomUUID(),
      userId,
      dodoCustomerId,
      dodoSubscriptionId,
      productId: productId ?? null,
      status,
    });
  }
  console.log(
    `[Dodo] subscription ${dodoSubscriptionId} for ${email} → ${status}`,
  );
}
