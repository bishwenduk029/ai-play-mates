"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Subscription button — shows "Upgrade" (creates a Dodo checkout session and
 * redirects to it) or "Manage subscription" (links to the Dodo customer
 * portal) depending on whether the user is premium. Pure shadcn.
 *
 * The Upgrade click calls POST /api/checkout, which returns { url }; we then
 * window.location to it (the redirect to Dodo's hosted checkout page).
 */
export function SubscriptionButton({ size = "sm" }: { size?: "sm" | "lg" }) {
  const [premium, setPremium] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

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

  async function startCheckout() {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      // fall through to reload
    }
    setLoading(false);
  }

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
    <Button size={size} onClick={startCheckout} disabled={loading}>
      {loading ? "Redirecting…" : "Upgrade · $1/mo"}
    </Button>
  );
}
