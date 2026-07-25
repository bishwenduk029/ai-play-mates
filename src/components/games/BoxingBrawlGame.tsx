"use client";

import { useEffect, useRef } from "react";
import { useBoxingGloves } from "@/lib/games/useBoxingGloves";
import { PhaserGame } from "./PhaserGame";
import { BOXING_BRAWL_CONFIG, type PunchInput } from "@/lib/games/boxing-brawl/scene";

/**
 * Boxing Brawl — the wired-together game.
 *
 * Pipes MediaPipe pose data (punch) from useBoxingGloves into the Phaser
 * game's registry every frame; the scene reads it in update(). The
 * calibration/intro is minimal (no two-hand yoke — just throw a punch to
 * start), with a keyboard fallback (Space = punch).
 */
export function BoxingBrawlGame() {
  const { state, getPunch } = useBoxingGloves(true);
  const rafRef = useRef<number | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);

  useEffect(() => {
    function loop() {
      const game = gameRef.current;
      if (game) {
        const p = getPunch();
        game.registry.set("punch", { punch: p.punch, arm: p.arm } satisfies PunchInput);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getPunch]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-3xl">
        <PhaserGame
          config={{ ...BOXING_BRAWL_CONFIG, parent: "boxing-brawl-container" }}
          onReady={(g) => {
            gameRef.current = g;
          }}
          className="w-full overflow-hidden rounded-xl ring-1 ring-foreground/10"
        />
      </div>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span
          className={[
            "flex h-2 w-2 rounded-full",
            state.ready ? "bg-emerald-500" : "bg-amber-500",
          ].join(" ")}
        />
        <span>
          {state.ready
            ? state.error ?? "THROW PUNCHES (jab toward the camera) — first to 20 wins!"
            : "Starting camera…"}
        </span>
      </div>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        Throw real punches at the zombie boxer. Counter during its windup to
        interrupt. No camera? Mash Space to punch. First to land 20 wins the bout.
      </p>
    </div>
  );
}
