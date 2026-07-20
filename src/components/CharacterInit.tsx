"use client";

import { useEffect } from "react";
import { controller } from "@/lib/actions";
import { fetchCharacter } from "@/lib/characters";

/**
 * Client component that initializes the controller with a specific character
 * when the page loads. Rendered once at the top of the mate page.
 */
export function CharacterInit({ characterId }: { characterId: string }) {
  useEffect(() => {
    if (controller.isSessionLive()) return; // don't swap during a live session
    fetchCharacter(characterId)
      .then((manifest) => controller.setCharacter(manifest))
      .catch((e) => console.error("Failed to load character:", e));
  }, [characterId]);

  return null;
}
