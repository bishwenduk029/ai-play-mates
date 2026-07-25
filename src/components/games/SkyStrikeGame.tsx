"use client";

import { useEffect, useRef } from "react";
import { useFlightYoke } from "@/lib/games/useFlightYoke";
import { PhaserGame } from "./PhaserGame";
import { SKY_STRIKE_CONFIG, type FlightInput } from "@/lib/games/sky-strike/scene";

/**
 * Sky Strike — the wired-together game.
 *
 * Pipes MediaPipe gesture data (bank/climb/fire) from useFlightYoke into the
 * Phaser game's registry every frame; the scene reads it in update(). The
 * calibration overlay (two-hand "grab the yoke" intro) is React, driven by
 * the hook's handsSeen/fistsClosed/aligned telemetry.
 */
export function SkyStrikeGame() {
  const { state, getFlight } = useFlightYoke(true);
  const rafRef = useRef<number | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);

  // Push flight state -> game.registry each frame (no React re-renders).
  useEffect(() => {
    function loop() {
      const game = gameRef.current;
      if (game) {
        const f = getFlight();
        game.registry.set("flight", {
          aligned: f.aligned,
          bank: f.bank,
          climb: f.climb,
          fire: f.fire,
        } satisfies FlightInput);
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [getFlight]);

  const aligned = state.aligned;
  const hands = state.handsSeen;
  const fists = state.fistsClosed;

  return (
    <div className="relative flex flex-col items-center gap-4">
      <div className="relative w-full max-w-3xl">
        <PhaserGame
          config={{ ...SKY_STRIKE_CONFIG, parent: "sky-strike-container" }}
          onReady={(g) => {
            gameRef.current = g;
          }}
          className="w-full overflow-hidden rounded-xl ring-1 ring-foreground/10"
        />

        {/* Calibration overlay — shown until both fists align. */}
        {!aligned && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 bg-background/55 backdrop-blur-[2px]">
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Grab the flight yoke
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Make a fist with <strong>both</strong> hands to align controls.
              </p>
            </div>

            <div className="flex items-end gap-16">
              <HandGrip label="Left handle" active={hands >= 1} locked={fists >= 1} />
              <HandGrip label="Right handle" active={hands >= 2} locked={fists >= 2} />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span
                className={[
                  "flex h-2 w-2 rounded-full",
                  state.ready ? "bg-emerald-500" : "bg-amber-500",
                ].join(" ")}
              />
              <span className="text-muted-foreground">
                {state.error ?? "Show both fists to the camera…"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
        <span
          className={[
            "flex h-2 w-2 rounded-full",
            aligned ? "bg-emerald-500" : "bg-amber-500",
          ].join(" ")}
        />
        <span>
          {aligned
            ? "FISTS = steer  •  PULL UP = climb  •  THUMB UP/DOWN = fire"
            : "Aligning controls…"}
        </span>
      </div>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        Bandits scale up as they close in. Bank to roll the horizon, pull up to
        climb over them, and thumb to fire before they reach your cockpit. No
        camera? Use ←/→ to bank, ↑ to climb, Space to fire.
      </p>
    </div>
  );
}

/** A single on-screen joystick handle the kid is asked to "grab". */
function HandGrip({
  label,
  active,
  locked,
}: {
  label: string;
  active: boolean;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={[
          "flex h-24 w-16 items-center justify-center rounded-lg border-2 text-3xl transition-colors",
          locked
            ? "border-emerald-400 bg-emerald-400/15"
            : active
              ? "border-amber-400 bg-amber-400/10"
              : "border-muted-foreground/40 bg-muted/30",
        ].join(" ")}
      >
        <span className={locked ? "opacity-100" : "opacity-50"}>
          {locked ? "✊" : "✋"}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
