"use client";

import { useEffect, useRef } from "react";
import { usePosePunch } from "@/lib/games/usePosePunch";
import { PhaserGame } from "./PhaserGame";
import { JUNGLE_BLAST_CONFIG, type JungleBlastPoseInput } from "@/lib/games/jungle-blast/scene";

/**
 * Jungle Blast — the wired-together game.
 *
 * Pipes MediaPipe pose data (kick/jump/run) from usePosePunch into the Phaser
 * game's registry every frame; the scene reads it in update(). Keyboard is a
 * desktop fallback for testing; on mobile the game is driven by MediaPipe pose
 * via the device camera.
 */
export function JungleBlastGame() {
  const { state, getPose } = usePosePunch(true);
  const rafRef = useRef<number | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);

  // Push pose -> game.registry each frame (no React re-renders during play).
  useEffect(() => {
    function loop() {
      const game = gameRef.current;
      if (game) {
        const p = getPose();
        game.registry.set("pose", {
          kick: p.kick,
          jump: p.jump,
          run: p.run,
        } satisfies JungleBlastPoseInput);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getPose]);

  return (
    <div className="flex flex-col items-center gap-4">
      <PhaserGame
        config={{ ...JUNGLE_BLAST_CONFIG, parent: "jungle-blast-container" }}
        onReady={(g) => {
          gameRef.current = g;
        }}
        className="w-full max-w-3xl overflow-hidden rounded-xl ring-1 ring-foreground/10"
      />
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span
          className={[
            "flex h-2 w-2 rounded-full",
            state.ready ? "bg-emerald-500" : "bg-amber-500",
          ].join(" ")}
        />
        <span>
          {state.ready
            ? state.error ?? "KICK (lift a foot) + JUMP (both feet up) + run (lean)"
            : "Starting camera…"}
        </span>
      </div>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        The hero auto-walks through the jungle. Kick to blast charging animals,
        jump to ground-pound a crowd. Let one past the hero and you lose a life.
      </p>
    </div>
  );
}
