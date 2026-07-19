"use client";

import { useEffect, useState } from "react";
import { controller } from "@/lib/actions";
import { useActionState } from "@/lib/useActionState";
import {
  fetchAllCharacters,
  type CharacterManifest,
} from "@/lib/characters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Dev-only control panel: full action buttons + walk D-pad for testing
 * without the LiveKit agent. Available at /play?dev=1.
 */
export function DevControlPanel() {
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

  const activeActions = character?.actions ?? [];
  const emotionActions = activeActions.filter(
    (a) => a.name !== "idle" && !a.name.startsWith("walk"),
  );
  const hasWalk = activeActions.some((a) => a.name.startsWith("walk"));

  return (
    <div className="pointer-events-auto flex w-[min(92vw,30rem)] flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/80">
            Dev panel
          </p>
          <p className="text-sm text-muted-foreground">
            {character?.label} · {character?.actions.length ?? 0} actions
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize text-foreground">
          {state.current}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Body
        </span>
        {characters.map((c) => {
          const active = state.characterId === c.id;
          return (
            <button
              key={c.id}
              disabled={sessionLive}
              onClick={() => controller.setCharacter(c)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
                sessionLive && !active && "opacity-40",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          onClick={() => controller.trigger("idle")}
          className={cn(state.current === "idle" && "bg-primary text-primary-foreground")}
        >
          Idle
        </Button>
        {emotionActions.map((a) => (
          <Button
            key={a.name}
            variant="secondary"
            onClick={() => controller.trigger(a.name)}
            className={cn(state.current === a.name && "bg-primary text-primary-foreground")}
          >
            {a.label}
          </Button>
        ))}
      </div>

      {hasWalk && (
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-muted p-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Walk</p>
          <div className="grid grid-cols-3 gap-1.5">
            <span />
            <WalkBtn name="walkForward" label="▲" />
            <span />
            <WalkBtn name="walkLeft" label="◀" />
            <WalkBtn name="walkBack" label="▼" />
            <WalkBtn name="walkRight" label="▶" />
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground/60">
        Dev panel — use{" "}
        <code className="text-foreground">SPAC.trigger("attack")</code> from
        the console.
      </p>
    </div>
  );
}

function WalkBtn({ name, label }: { name: string; label: string }) {
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={() => controller.trigger(name)}
      className="h-9 w-9"
    >
      {label}
    </Button>
  );
}
