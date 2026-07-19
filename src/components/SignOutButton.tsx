"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => authClient.signOut().then(() => (window.location.href = "/login"))}
      className="pointer-events-auto text-muted-foreground hover:text-foreground"
    >
      Sign out
    </Button>
  );
}
