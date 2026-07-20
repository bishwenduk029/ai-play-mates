"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Subscription button — shows "Upgrade" (links to Dodo hosted checkout) or
 * "Manage subscription" (links to Dodo customer portal) depending on whether
 * the user is premium. Pure shadcn; no custom checkout UI.
 *
 * Fetches status from /api/subscription/status (server reads the DB). On error
 * or while loading, shows the Upgrade CTA (safe default — clicking it either
 * starts checkout or, if already premium, Dodo's page handles it).
 */
export function SubscriptionButton({ size = "sm" }: { size?: "sm" | "lg" }) {
  const [premium, setPremium] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscription/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setPremium(!!d?.premium);
      })
      .catch(() => {
        if (!cancelled) setPremium(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (premium) {
    return (
      <a href="/api/customer-portal">
        <Button variant="ghost" size={size}>
          Manage subscription
        </Button>
      </a>
    );
  }

  return (
    <a href="/api/checkout">
      <Button size={size}>Upgrade · $1/mo</Button>
    </a>
  );
}
