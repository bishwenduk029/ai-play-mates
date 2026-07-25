"use client";

import { useEffect, useRef, useState } from "react";
import { Cast, Maximize2, Minimize2, X } from "lucide-react";
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
 *   - **Cast to TV**: opens a guide to mirror the tab to a TV/Chromecast/
 *     AirPlay. Mirroring (not a custom receiver) is used deliberately: the
 *     webcam stays on this device so motion control keeps working, while the
 *     TV is just the big display. Tab/screen mirroring is free and needs no
 *     Cast SDK registration.
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
  const [showCast, setShowCast] = useState(false);

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
      <div className="absolute right-2 top-2 z-50 flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={() => setShowCast((s) => !s)}
          aria-label="Cast to TV"
          title="Cast to TV"
          className="size-8 bg-background/80 backdrop-blur"
        >
          <Cast className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Expand"}
          className="size-8 bg-background/80 backdrop-blur"
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
      </div>

      {showCast && (
        <div className="absolute right-2 top-12 z-50 w-72 rounded-lg border bg-background/95 p-4 text-sm shadow-lg backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Cast to your TV</span>
            <button
              type="button"
              onClick={() => setShowCast(false)}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Mirror this tab so the whole room can see. Your webcam stays on this
            device, so motion control keeps working — the TV is just the big
            display.
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Chrome/Edge:</span> open
              the browser menu (⋮) → <span className="font-medium">Cast…</span> → set
              the source to <span className="font-medium">Cast tab</span> → pick your
              TV or Chromecast.
            </li>
            <li>
              <span className="font-medium text-foreground">Mac (AirPlay):</span> click
              the Screen Mirroring icon in the menu bar → pick your Apple TV / smart
              TV.
            </li>
            <li>
              Hit <span className="font-medium">Expand ⤢</span> here for a clean
              full-screen view, then step back and play.
            </li>
          </ol>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Tip: keep this laptop/phone facing you so the camera sees your hands.
          </p>
        </div>
      )}
    </div>
  );
}
