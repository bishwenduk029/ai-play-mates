"use client";

import { useEffect, useState } from "react";
import { controller } from "@/lib/actions";
import { useActionState } from "@/lib/useActionState";
import {
  fetchAllCharacters,
  type CharacterManifest,
} from "@/lib/characters";

/**
 * Dev control panel.
 * - Pre-session: pick a character (manifest-driven).
 * - Live session: character is locked; actions for that character only.
 */
export function ControlPanel() {
  const state = useActionState();
  const [characters, setCharacters] = useState<CharacterManifest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const character = controller.getCharacter();
  const sessionLive = controller.isSessionLive();

  useEffect(() => {
    let cancelled = false;
    fetchAllCharacters()
      .then((list) => {
        if (cancelled) return;
        setCharacters(list);
        // Auto-select the first character if none is active yet.
        if (!controller.getCharacter() && list[0]) {
          controller.setCharacter(list[0]);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(String(e));
      });
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
    <div className="pointer-events-auto flex w-[min(92vw,30rem)] flex-col gap-3 rounded-2xl border border-border scene-overlay p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground/80">AI Play Mates</p>
          <p className="text-sm text-muted-foreground">AI Play Mates for kids</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium capitalize scene-accent">
          {state.current}
        </span>
      </div>

      {/* Character picker — locked during a live LiveKit session. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Character
          </span>
          {sessionLive && (
            <span className="text-[10px] text-amber-300/80">locked during call</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {characters.map((c) => {
            const active = state.characterId === c.id;
            return (
              <button
                key={c.id}
                disabled={sessionLive}
                onClick={() => controller.setCharacter(c)}
                className={[
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "bg-emerald-400 text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                  sessionLive && !active ? "opacity-40" : "",
                ].join(" ")}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {loadError && (
          <p className="text-[10px] text-rose-300/80">{loadError}</p>
        )}
      </div>

      {/* Action buttons for the active character only. */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => controller.trigger("idle")}
          className={[
            "rounded-xl px-3 py-2 text-sm font-medium transition",
            state.current === "idle"
              ? "bg-primary text-primary-foreground"
              : "bg-muted/80 hover:bg-muted/80",
          ].join(" ")}
        >
          Idle
        </button>
        {emotionActions.map((a) => {
          const active = state.current === a.name;
          return (
            <button
              key={a.name}
              onClick={() => controller.trigger(a.name)}
              className={[
                "rounded-xl px-3 py-2 text-sm font-medium transition",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/80 hover:bg-muted/80",
              ].join(" ")}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      {hasWalk && (
        <div className="flex flex-col items-center gap-1.5 rounded-xl bg-muted p-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Walk</p>
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

      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
        <p className="text-[11px] text-muted-foreground">Lipsync test</p>
        <button
          onClick={() => controller.setSpeaking(!controller.isSpeaking())}
          className={[
            "rounded-full px-3 py-1 text-xs font-medium transition",
            controller.isSpeaking()
              ? "bg-pink-400 text-primary-foreground"
              : "scene-overlay hover:scene-overlay-muted",
          ].join(" ")}
        >
          {controller.isSpeaking() ? "Speaking" : "Silent"}
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Console:{" "}
        <code className="text-muted-foreground">{`SPAC.trigger("attack")`}</code>,{" "}
        <code className="text-muted-foreground">{`SPAC.walkLeft()`}</code>
      </p>
    </div>
  );
}

function WalkBtn({ name, label }: { name: string; label: string }) {
  return (
    <button
      onClick={() => controller.trigger(name)}
      className="h-9 w-9 rounded-lg bg-muted/80 transition hover:bg-muted/80"
    >
      {label}
    </button>
  );
}
