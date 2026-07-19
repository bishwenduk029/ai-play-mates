"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => authClient.signOut().then(() => (window.location.href = "/sign-in"))}
      className="pointer-events-auto text-white/60 hover:text-white"
    >
      Sign out
    </Button>
  );
}
