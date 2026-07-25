"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type Phaser from "phaser";

/**
 * Generic React host for a Phaser game. Owns the Phaser.Game lifecycle: it
 * creates the game on mount, destroys it on unmount, and never re-renders
 * during play (Phaser runs its own loop on the canvas).
 *
 * The caller passes the game config + a per-frame updater that can push
 * external state (e.g. pose data) into the game via `game.registry`.
 *
 * Two game-agnostic controls live here (the "pull common parts up" seam) so
 * every game inherits them for free:
 *   - **Expand**: true browser fullscreen on the game container; Phaser's
 *     Scale.FIT mode auto-rescales the canvas to fill the screen.
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
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Track the browser fullscreen state so the button icon flips correctly
  // (covers ESC exit, which doesn't go through our toggle).
  useEffect(() => {
    function onFsChange() {
      const el = containerRef.current;
      setIsFullscreen(!!(el && document.fullscreenElement === el));
      // The parent just changed size — re-fit the canvas to it so a 16:9
      // game fills the screen. (We deliberately do NOT force a landscape
      // orientation lock here: on Chrome Android, locking orientation
      // breaks the camera <video> feed / MediaPipe detection for our
      // motion-controlled games. The user rotates the phone manually;
      // Phaser's FIT mode handles any aspect ratio.)
      gameRef.current?.scale.refresh();
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen().catch(() => {
        // Some browsers reject without a user gesture; the click is one, so
        // this rarely fires. Ignore silently if it does.
      });
    }
  }

  return (
    <div
      ref={containerRef}
      id={String(config.parent)}
      className={[
        "relative bg-background",
        isFullscreen ? "h-screen w-screen" : className,
      ].join(" ")}
    >
      <Button
        type="button"
        size="icon"
        variant="secondary"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Expand"}
        className="absolute right-2 top-2 z-50 size-8 bg-background/80 backdrop-blur"
      >
        {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </Button>
    </div>
  );
}
