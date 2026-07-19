"use client";

import { useEffect, useRef } from "react";
import type Phaser from "phaser";

/**
 * Generic React host for a Phaser game. Owns the Phaser.Game lifecycle: it
 * creates the game on mount, destroys it on unmount, and never re-renders
 * during play (Phaser runs its own loop on the canvas).
 *
 * The caller passes the game config + a per-frame updater that can push
 * external state (e.g. pose data) into the game via `game.registry`.
 */
export function PhaserGame({
  config,
  onReady,
  className,
}: {
  config: Phaser.Types.Core.GameConfig;
  onReady?: (game: Phaser.Game) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let game: Phaser.Game | null = null;
    let cancelled = false;

    // Phaser must be imported dynamically on the client only — it touches
    // `window`/`document` at module load and must not be evaluated on the server.
    import("phaser").then(({ default: Phaser }) => {
      if (cancelled || !containerRef.current) return;
      game = new Phaser.Game(config);
      gameRef.current = game;
      onReady?.(game);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} id={String(config.parent)} className={className} />;
}
