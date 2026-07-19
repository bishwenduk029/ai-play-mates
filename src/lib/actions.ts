// S-PAC action controller — single source of truth for the active character
// and its current motion.
//
// Characters are pure data (see /public/characters/<id>/manifest.json). The
// controller loads a character's manifest and only allows that character's
// action names. Figure components read getState() every frame and apply the
// matching motion/clip.
//
// Lipsync: getMouth() returns a 0..1 open amount. While speaking is on, it
// auto-oscillates; Livekit TTS amplitude can later call setMouth(level).

import type { CharacterAction, CharacterManifest } from "./characters";
import { actionDuration } from "./characters";

export type WalkDirection = "forward" | "back" | "left" | "right";

export interface ActionState {
  /** Name of the action currently playing (e.g. "idle", "attack", "walk"). */
  current: string;
  startedAt: number;
  durationMs: number; // Infinity = loops until interrupted
  position: { x: number; z: number };
  walk: { from: { x: number; z: number }; to: { x: number; z: number } } | null;
  facing: number | null; // radians override for walk; null = face camera
  /** Active character id (manifest-driven). */
  characterId: string;
}

type Listener = () => void;
type TimerHandle = ReturnType<typeof setTimeout>;

const BOUND = 4;
const WALK_STEP = 2;
const WALK_DURATION_MS = 1200;

const WALK_VECTOR: Record<WalkDirection, { x: number; z: number }> = {
  forward: { x: 0, z: 1 },
  back: { x: 0, z: -1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

const WALK_FACING: Record<WalkDirection, number> = {
  forward: 0,
  back: Math.PI,
  left: -Math.PI / 2,
  right: Math.PI / 2,
};

declare global {
  interface Window {
    SPAC?: ActionController;
  }
}

class ActionController {
  private state: ActionState = {
    current: "idle",
    startedAt: 0,
    durationMs: Infinity,
    position: { x: 0, z: 0 },
    walk: null,
    facing: null,
    characterId: "creature",
  };
  private character: CharacterManifest | null = null;
  private listeners = new Set<Listener>();
  private timer: TimerHandle | null = null;
  private sessionLive = false;

  // Lipsync
  private speaking = false;
  private mouthOverride: number | null = null;
  private mouthAuto = 0;

  getState(): ActionState {
    return this.state;
  }

  getCharacter(): CharacterManifest | null {
    return this.character;
  }

  isSessionLive(): boolean {
    return this.sessionLive;
  }

  /** Called by LiveKitSession — locks character switching while a call is live. */
  setSessionLive(live: boolean): void {
    this.sessionLive = live;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Install the active character's manifest. Resets motion to idle. Rejected
   * while a LiveKit session is live — pick character before starting a call.
   */
  setCharacter(manifest: CharacterManifest): void {
    if (this.sessionLive) return;
    this.character = manifest;
    this.state = {
      ...this.state,
      characterId: manifest.id,
      current: "idle",
      startedAt: performance.now(),
      durationMs: Infinity,
      walk: null,
      facing: null,
    };
    this.emit();
  }

  /** Actions available on the active character (empty until a manifest is set). */
  listActions(): CharacterAction[] {
    return this.character?.actions ?? [];
  }

  /**
   * Trigger an action by name. The name must belong to the active character's
   * action vocabulary. Unknown names no-op.
   */
  trigger(name: string): void {
    const action = this.character?.actions.find((a) => a.name === name);
    if (!action) return;

    if (name === "idle") {
      this.idle();
      return;
    }
    if (name.startsWith("walk")) {
      const dir = walkDirFromName(name);
      if (dir) void this.walk(dir);
      return;
    }
    void this.run(name, actionDuration(action));
  }

  idle(): void {
    this.begin("idle", Infinity);
  }

  walk(dir: WalkDirection): Promise<void> {
    // Walk is valid whenever the character declares any walk* action.
    const hasWalk = this.character?.actions.some((a) => a.name.startsWith("walk"));
    if (!hasWalk) return Promise.resolve();

    const vec = WALK_VECTOR[dir];
    const from = { ...this.state.position };
    const to = {
      x: clamp(from.x + vec.x * WALK_STEP, -BOUND, BOUND),
      z: clamp(from.z + vec.z * WALK_STEP, -BOUND, BOUND),
    };
    if (to.x === from.x && to.z === from.z) return Promise.resolve();
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = {
      ...this.state,
      current: "walk",
      startedAt: performance.now(),
      durationMs: WALK_DURATION_MS,
      walk: { from, to },
      facing: WALK_FACING[dir],
    };
    this.emit();
    return new Promise<void>((resolve) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.state = {
          ...this.state,
          position: { ...to },
          walk: null,
          facing: null,
          current: "idle",
          startedAt: performance.now(),
          durationMs: Infinity,
        };
        this.emit();
        resolve();
      }, WALK_DURATION_MS);
    });
  }

  walkForward(): Promise<void> {
    return this.walk("forward");
  }
  walkBack(): Promise<void> {
    return this.walk("back");
  }
  walkLeft(): Promise<void> {
    return this.walk("left");
  }
  walkRight(): Promise<void> {
    return this.walk("right");
  }

  // --- Lipsync ------------------------------------------------------------

  setSpeaking(on: boolean): void {
    this.speaking = on;
    if (!on) this.mouthOverride = null;
    this.emit();
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  setMouth(level: number): void {
    this.mouthOverride = Math.max(0, Math.min(1, level));
    if (level > 0) this.speaking = true;
    this.emit();
  }

  getMouth(): number {
    if (this.mouthOverride !== null) return this.mouthOverride;
    if (!this.speaking) return 0;
    const t = performance.now() / 1000;
    const v =
      0.5 +
      0.28 * Math.sin(t * 13.1) +
      0.16 * Math.sin(t * 7.7 + 1.2) +
      0.08 * Math.sin(t * 23.0 + 0.5);
    this.mouthAuto = v;
    return Math.max(0, Math.min(1, v));
  }

  // --- internals ----------------------------------------------------------

  private begin(action: string, durationMs: number): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state = {
      ...this.state,
      current: action,
      startedAt: performance.now(),
      durationMs,
      walk: null,
      facing: null,
    };
    this.emit();
  }

  private run(action: string, durationMs: number): Promise<void> {
    this.begin(action, durationMs);
    if (durationMs === Infinity) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.state.current === action) this.begin("idle", Infinity);
        resolve();
      }, durationMs);
    });
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function walkDirFromName(name: string): WalkDirection | null {
  switch (name) {
    case "walkForward":
      return "forward";
    case "walkBack":
      return "back";
    case "walkLeft":
      return "left";
    case "walkRight":
      return "right";
  }
  return null;
}

export const controller = new ActionController();

if (typeof window !== "undefined") {
  window.SPAC = controller;
}
