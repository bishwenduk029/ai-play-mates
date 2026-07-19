"use client";

import { useEffect, useState } from "react";
import { controller } from "@/lib/actions";
import { useActionState } from "@/lib/useActionState";
import {
  fetchAllCharacters,
  type CharacterManifest,
} from "@/lib/characters";
import { cn } from "@/lib/utils";

/**
 * Minimal character picker for the kid-facing /play page.
 * Just two/three circular icons — pick a companion, that's it.
 * The AI agent drives all character actions; no manual controls here.
 *
 * The full dev panel (action buttons, walk D-pad, etc.) is available
 * at /play?dev=1 for testing without the agent.
 */
export function ControlPanel() {
  const state = useActionState();
  const [characters, setCharacters] = useState<CharacterManifest[]>([]);
  const character = controller.getCharacter();
  const sessionLive = controller.isSessionLive();

  useEffect(() => {
    let cancelled = false;
    fetchAllCharacters()
      .then((list) => {
        if (cancelled) return;
        setCharacters(list);
        if (!controller.getCharacter() && list[0]) {
          controller.setCharacter(list[0]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card p-1.5 shadow-lg">
      {characters.map((c) => {
        const active = state.characterId === c.id;
        return (
          <button
            key={c.id}
            disabled={sessionLive}
            onClick={() => controller.setCharacter(c)}
            aria-label={c.label}
            className={cn(
              "h-10 w-10 rounded-full text-base transition",
              active
                ? "bg-primary text-primary-foreground scale-110"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
              sessionLive && !active && "opacity-40",
            )}
          >
            {characterEmoji(c.id)}
          </button>
        );
      })}
    </div>
  );
}

/** Map character id to a friendly emoji so kids can pick visually. */
function characterEmoji(id: string): string {
  switch (id) {
    case "bunny":
      return "🐰";
    case "creature":
      return "🐊";
    case "avatar":
      return "🤖";
    default:
      return "✨";
  }
}
