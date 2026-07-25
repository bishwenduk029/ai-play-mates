"use client";

import { useEffect, useRef, useState } from "react";
import { GestureRecognizer, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * MediaPipe GestureRecognizer hook for "Sky Strike" — a fighter-pilot POV game
 * driven by a two-handed flight yoke made of the kid's own fists.
 *
 * CALIBRATION (the intro handshake):
 *   The kid must make a CLOSED FIST with BOTH hands ("grab both handles").
 *   Once both fists are seen, controls ALIGN, a baseline hand position is
 *   captured, and play begins. Alignment is STICKY: losing a hand (common
 *   when banking moves a fist near the frame edge) just zeroes the steering
 *   momentarily — it does NOT force re-calibration. Controls only disengage
 *   if BOTH hands are gone for >DISENGAGE_MS (the kid walked away).
 *
 * GESTURES (once aligned):
 *   - Move both fists LEFT/RIGHT  → bank left/right (horizon rolls).
 *   - Pull both fists UP          → climb (horizon pitches down, more sky).
 *   - THUMB_UP or THUMB_DOWN      → fire (single shot, debounced).
 *
 * Keyboard/touch fallback is ALWAYS active when the camera is unavailable
 * (disabled, or failed to start) — in that case `aligned` is forced true and
 * ArrowLeft/Right=bank, ArrowUp/W=climb, Space=fire drive the game directly.
 * When the camera IS enabled and working, alignment is required for any input
 * (including keyboard) so the calibration intro is honoured.
 */

export interface FlightState {
  /** True once the yoke handshake completed (or camera is off). Gates input. */
  aligned: boolean;
  /** -1..1 bank (−1 hard left, +1 hard right, 0 level). */
  bank: number;
  /** 0..1 climb (0 level, 1 full pull-up). */
  climb: number;
  /** 1 = fresh fire trigger this frame (debounced ~350ms). */
  fire: number;
  /** True once the input loop is running. */
  ready: boolean;
  /** Last camera/model error, if any. */
  error: string | null;
  /** Calibration telemetry for the overlay (always meaningful, even off-camera). */
  handsSeen: number; // 0..2 hands detected this frame
  fistsClosed: number; // 0..2 hands whose top gesture is Closed_Fist
}

const NO_FLIGHT: FlightState = {
  aligned: false,
  bank: 0,
  climb: 0,
  fire: 0,
  ready: false,
  error: null,
  handsSeen: 0,
  fistsClosed: 0,
};

// MediaPipe GestureRecognizer canned gesture names.
const G_FIST = "Closed_Fist";
const G_THUMB_UP = "Thumb_Up";
const G_THUMB_DOWN = "Thumb_Down";

// Landmark indices (MediaPipe Hand — 21 points). 0 = wrist, 9 = middle MCP.
const WRIST = 0;

// Control sensitivities (normalized 0..1 hand coords).
const BANK_RANGE = 0.16; // hand-x displacement for full bank deflection
const CLIMB_RANGE = 0.12; // hand-y rise for full climb
const BANK_DEADZONE = 0.03;
const CLIMB_DEADZONE = 0.03;

const FIRE_COOLDOWN_MS = 350;
const DISENGAGE_MS = 2500; // BOTH hands lost this long → re-calibrate (kid walked away)

/** Touch input set externally by on-screen controls (mobile). */
interface TouchInput {
  bank: number; // -1, 0, 1
  climb: boolean;
  fire: boolean;
}

export function useFlightYoke(enabled: boolean) {
  const [state, setState] = useState<FlightState>(NO_FLIGHT);
  const flightRef = useRef<FlightState>({ ...NO_FLIGHT });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const rafRef = useRef<number | null>(null);

  // Calibration baseline (captured when alignment first locks).
  const baselineXRef = useRef<number | null>(null);
  const baselineYRef = useRef<number | null>(null);
  const alignedRef = useRef(false);
  const handsLostSinceRef = useRef<number | null>(null);
  const lastFireRef = useRef(0);
  // Thumb trigger state — fire on a sustained thumb-up/down then release
  // (a deliberate "up and down" pump), not on a flicker or a held gesture.
  const thumbUpActiveRef = useRef(false);
  const thumbUpSinceRef = useRef(0);
  const thumbDownActiveRef = useRef(false);
  const thumbDownSinceRef = useRef(0);

  // Keyboard + touch (always wired).
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<TouchInput>({ bank: 0, climb: false, fire: false });

  function setTouch(t: Partial<TouchInput>) {
    touchRef.current = { ...touchRef.current, ...t };
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      keysRef.current[e.code] = true;
    }
    function onKeyUp(e:KeyboardEvent) {
      keysRef.current[e.code] = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    function coreLoop(cameraDetect: (() => {
      aligned: boolean;
      bank: number;
      climb: number;
      fire: number;
      handsSeen: number;
      fistsClosed: number;
    }) | null) {
      return () => {
        if (cancelled) return;
        const k = keysRef.current;
        const t = touchRef.current;

        let aligned = flightRef.current.aligned;
        let bank = 0;
        let climb = 0;
        let fire = 0;
        let handsSeen = 0;
        let fistsClosed = 0;

        // Camera-driven detection. When the camera is on and working, it owns
        // alignment; keyboard/touch only contribute once aligned (so the
        // calibration intro is honoured). When the camera is off/failed,
        // cameraDetect is null and aligned is forced true below.
        if (cameraDetect) {
          try {
            const c = cameraDetect();
            aligned = c.aligned;
            handsSeen = c.handsSeen;
            fistsClosed = c.fistsClosed;
            if (aligned) {
              bank = c.bank;
              climb = c.climb;
              fire = c.fire;
              // Keyboard augments (lets a kid with camera also tap keys).
              if (k["ArrowLeft"] || k["KeyA"]) bank -= 1;
              if (k["ArrowRight"] || k["KeyD"]) bank += 1;
              if (k["ArrowUp"] || k["KeyW"]) climb = Math.max(climb, 1);
              if (k["Space"]) fire = Math.max(fire, 1);
              if (t.bank !== 0) bank += t.bank;
              if (t.climb) climb = Math.max(climb, 1);
              if (t.fire) fire = Math.max(fire, 1);
            }
          } catch {
            // ignore transient detection errors
          }
        } else {
          // No camera — keyboard/touch drive everything, always "aligned".
          aligned = true;
          if (k["ArrowLeft"] || k["KeyA"]) bank -= 1;
          if (k["ArrowRight"] || k["KeyD"]) bank += 1;
          if (k["ArrowUp"] || k["KeyW"]) climb = 1;
          if (k["Space"]) fire = 1;
          if (t.bank !== 0) bank += t.bank;
          if (t.climb) climb = Math.max(climb, 1);
          if (t.fire) fire = Math.max(fire, 1);
        }

        bank = Math.max(-1, Math.min(1, bank));
        climb = Math.max(0, Math.min(1, climb));

        const next: FlightState = {
          aligned,
          bank,
          climb,
          fire,
          ready: true,
          error: flightRef.current.error,
          handsSeen,
          fistsClosed,
        };
        flightRef.current = next;
        setState(next);
        rafRef.current = requestAnimationFrame(coreLoop(cameraDetect));
      };
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      // Start the keyboard/touch loop immediately (aligned=true, no camera).
      rafRef.current = requestAnimationFrame(coreLoop(null));

      if (!enabled) return; // keyboard/touch-only mode

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) return;

        const video = document.createElement("video");
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        videoRef.current = video;

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        if (cancelled) return;
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
        recognizerRef.current = recognizer;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(coreLoop(cameraDetect));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Camera/model failed — keep the keyboard/touch loop running and let
        // the kid play. Surface the error so the UI can explain.
        const next: FlightState = {
          ...flightRef.current,
          aligned: true,
          ready: true,
          error: `Camera unavailable: ${msg}. Use keyboard/touch controls.`,
        };
        flightRef.current = next;
        setState(next);
      }
    }

    /** Per-frame camera detection from the GestureRecognizer. */
    function cameraDetect() {
      const rec = recognizerRef.current;
      const v = videoRef.current;
      if (!rec || !v || v.readyState < 2) {
        return { aligned: alignedRef.current, bank: 0, climb: 0, fire: 0, handsSeen: 0, fistsClosed: 0 };
      }

      const result = rec.recognizeForVideo(v, performance.now());
      const lm = result.landmarks ?? [];
      const ges = result.gestures ?? [];
      const handsSeen = lm.length;
      let fistsClosed = 0;
      for (let i = 0; i < handsSeen; i++) {
        const top = ges[i]?.[0]?.categoryName;
        if (top === G_FIST) fistsClosed += 1;
      }

      const now = performance.now();

      // ALIGNMENT: require both hands fisted to lock. Once locked, STAY locked
      // — losing one hand (common while banking) must NOT re-calibrate. Only
      // disengage when BOTH hands are gone for DISENGAGE_MS (kid walked away).
      if (!alignedRef.current) {
        if (handsSeen >= 2 && fistsClosed >= 2) {
          // Capture baseline from the two wrists (average). Mirrored selfie
          // view: we work in screen space, so x is direct.
          const xs = lm.map((h) => h[WRIST].x);
          const ys = lm.map((h) => h[WRIST].y);
          baselineXRef.current = (xs[0] + xs[1]) / 2;
          baselineYRef.current = (ys[0] + ys[1]) / 2;
          alignedRef.current = true;
          handsLostSinceRef.current = null;
        }
      } else if (handsSeen === 0) {
        // Both hands gone — start the walk-away timer. A single visible hand
        // keeps the session alive (steering just zeros until both return).
        if (handsLostSinceRef.current == null) handsLostSinceRef.current = now;
        if (now - handsLostSinceRef.current > DISENGAGE_MS) {
          alignedRef.current = false;
          baselineXRef.current = null;
          baselineYRef.current = null;
        }
      } else {
        // ≥1 hand visible — we're still here. Reset the walk-away timer.
        handsLostSinceRef.current = null;
      }

      let bank = 0;
      let climb = 0;
      let fire = 0;

      if (alignedRef.current && handsSeen >= 2 && baselineXRef.current != null && baselineYRef.current != null) {
        // Require BOTH hands for steering so a dropped hand can't yank the
        // average and spike the plane. If one hand is briefly lost, steering
        // zeros (plane levels) until both return — no re-calibration.
        const xs = lm.map((h) => h[WRIST].x);
        const ys = lm.map((h) => h[WRIST].y);
        const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;

        // The video element is hidden and raw front-camera frames are NOT
        // mirrored: when the kid moves their hands to THEIR left, the hands
        // appear on the right side of the image and avgX INCREASES. Negate
        // the displacement so body-left → plane-left (natural mirror feel).
        let dx = -(avgX - baselineXRef.current);
        if (Math.abs(dx) < BANK_DEADZONE) dx = 0;
        bank = Math.max(-1, Math.min(1, dx / BANK_RANGE));

        // Pull up = hands rise (avgY decreases).
        let dy = baselineYRef.current - avgY; // positive when hands rose
        if (dy < CLIMB_DEADZONE) dy = 0;
        climb = Math.max(0, Math.min(1, dy / CLIMB_RANGE));

        // Fire on a deliberate thumb pump: hold a thumb-up OR thumb-down for
        // >= THUMB_HOLD_MS, then release. A moving fist flickers through
        // thumb gestures for <1 frame, so the min-hold filters them out; the
        // release requirement means the kid does the full "up and down".
        const THUMB_HOLD_MS = 90;
        let anyUp = false;
        let anyDown = false;
        for (let i = 0; i < handsSeen; i++) {
          const top = ges[i]?.[0]?.categoryName;
          if (top === G_THUMB_UP) anyUp = true;
          else if (top === G_THUMB_DOWN) anyDown = true;
        }
        // Rising edges arm the trigger.
        if (anyUp && !thumbUpActiveRef.current) {
          thumbUpActiveRef.current = true;
          thumbUpSinceRef.current = now;
        }
        if (anyDown && !thumbDownActiveRef.current) {
          thumbDownActiveRef.current = true;
          thumbDownSinceRef.current = now;
        }
        // Falling edges fire if the gesture was held long enough.
        let firePulse = false;
        if (!anyUp && thumbUpActiveRef.current) {
          if (now - thumbUpSinceRef.current >= THUMB_HOLD_MS) firePulse = true;
          thumbUpActiveRef.current = false;
        }
        if (!anyDown && thumbDownActiveRef.current) {
          if (now - thumbDownSinceRef.current >= THUMB_HOLD_MS) firePulse = true;
          thumbDownActiveRef.current = false;
        }
        if (firePulse && now - lastFireRef.current > FIRE_COOLDOWN_MS) {
          lastFireRef.current = now;
          fire = 1;
        }
      }

      return {
        aligned: alignedRef.current,
        bank,
        climb,
        fire,
        handsSeen,
        fistsClosed,
      };
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      recognizerRef.current?.close();
      recognizerRef.current = null;
      videoRef.current = null;
    };
  }, [enabled]);

  return { state, getFlight: () => flightRef.current, setTouch };
}
