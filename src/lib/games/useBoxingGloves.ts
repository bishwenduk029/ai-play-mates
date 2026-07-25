"use client";

import { useEffect, useRef, useState } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * MediaPipe PoseLandmarker hook for "Boxing Brawl" — a POV boxing game where
 * the kid throws real punches and they land on an on-screen opponent.
 *
 * PUNCH DETECTION:
 *   A jab toward the camera extends the arm — the wrist moves away from the
 *   shoulder. We track the wrist→shoulder distance and trigger a punch when it
 *   rises rapidly (arm extending forward). Either arm counts. Debounced 350ms
 *   so one punch = one hit.
 *
 * Keyboard/touch fallback is ALWAYS active; camera augments but never gates
 * play. Space = punch. If the camera/CDN fails, the game still plays.
 *
 * Modelled on usePosePunch (Jungle Blast) — same structure, different signal.
 */

export interface PunchState {
  /** 1 = fresh punch this frame (debounced). */
  punch: number;
  /** Which arm punched last: "L" | "R" | "" — for variety/animation. */
  arm: "L" | "R" | "";
  /** True once the input loop is running. */
  ready: boolean;
  /** Last camera/model error, if any. */
  error: string | null;
}

const NO_PUNCH: PunchState = { punch: 0, arm: "", ready: false, error: null };

// MediaPipe Pose landmark indices.
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

const PUNCH_COOLDOWN_MS = 350;
const PUNCH_VELOCITY = 1.8; // wrist-shoulder distance/sec to count as a punch
const PUNCH_WINDOW = 6; // samples in the velocity window

interface TouchInput {
  punch: boolean;
}

export function useBoxingGloves(enabled: boolean) {
  const [state, setState] = useState<PunchState>(NO_PUNCH);
  const punchRef = useRef<PunchState>({ punch: 0, arm: "", ready: false, error: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPunchRef = useRef(0);
  // Rolling wrist→shoulder distance samples (one window per arm).
  const leftDistRef = useRef<{ d: number; t: number }[]>([]);
  const rightDistRef = useRef<{ d: number; t: number }[]>([]);

  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<TouchInput>({ punch: false });

  function setTouch(t: Partial<TouchInput>) {
    touchRef.current = { ...touchRef.current, ...t };
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      keysRef.current[e.code] = true;
    }
    function onKeyUp(e: KeyboardEvent) {
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
    function coreLoop(cameraDetect: (() => { punch: number; arm: "L" | "R" | "" }) | null) {
      return () => {
        if (cancelled) return;
        const k = keysRef.current;
        const t = touchRef.current;

        let punch = 0;
        let arm: "L" | "R" | "" = "";

        if (cameraDetect) {
          try {
            const c = cameraDetect();
            if (c.punch >= 1) {
              punch = 1;
              arm = c.arm;
            }
          } catch {
            // ignore transient detection errors
          }
        }

        // Keyboard + touch always work.
        if (k["Space"]) {
          punch = 1;
          arm = arm || "R";
        }
        if (t.punch) {
          punch = 1;
          arm = arm || "L";
        }

        const next: PunchState = { punch, arm, ready: true, error: punchRef.current.error };
        punchRef.current = next;
        setState(next);
        rafRef.current = requestAnimationFrame(coreLoop(cameraDetect));
      };
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      rafRef.current = requestAnimationFrame(coreLoop(null));
      if (!enabled) return;

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
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        landmarkerRef.current = landmarker;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(coreLoop(cameraDetect));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const next: PunchState = {
          punch: 0,
          arm: "",
          ready: true,
          error: `Camera unavailable: ${msg}. Use Space to punch.`,
        };
        punchRef.current = next;
        setState(next);
      }
    }

    function dist(ax: number, ay: number, bx: number, by: number): number {
      return Math.hypot(ax - bx, ay - by);
    }

    /** Returns punch velocity for an arm given its wrist+shoulder samples. */
    function armVelocity(ref: { d: number; t: number }[]): number {
      if (ref.length < 2) return 0;
      const first = ref[0];
      const last = ref[ref.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt <= 0) return 0;
      return (last.d - first.d) / dt; // positive = arm extending
    }

    function cameraDetect(): { punch: number; arm: "L" | "R" | "" } {
      const lm = landmarkerRef.current;
      const v = videoRef.current;
      if (!lm || !v || v.readyState < 2) return { punch: 0, arm: "" };

      const result = lm.detectForVideo(v, performance.now());
      if (!result.landmarks || result.landmarks.length === 0) return { punch: 0, arm: "" };
      const pts = result.landmarks[0];
      const now = performance.now();

      const lWrist = pts[LEFT_WRIST];
      const rWrist = pts[RIGHT_WRIST];
      const lShould = pts[LEFT_SHOULDER];
      const rShould = pts[RIGHT_SHOULDER];
      if (!lWrist || !rWrist || !lShould || !rShould) return { punch: 0, arm: "" };

      const lDist = dist(lWrist.x, lWrist.y, lShould.x, lShould.y);
      const rDist = dist(rWrist.x, rWrist.y, rShould.x, rShould.y);

      leftDistRef.current.push({ d: lDist, t: now });
      if (leftDistRef.current.length > PUNCH_WINDOW) leftDistRef.current.shift();
      rightDistRef.current.push({ d: rDist, t: now });
      if (rightDistRef.current.length > PUNCH_WINDOW) rightDistRef.current.shift();

      const lV = armVelocity(leftDistRef.current);
      const rV = armVelocity(rightDistRef.current);

      if (now - lastPunchRef.current < PUNCH_COOLDOWN_MS) return { punch: 0, arm: "" };

      // Trigger on whichever arm is extending faster (above threshold).
      if (lV > PUNCH_VELOCITY && lV >= rV) {
        lastPunchRef.current = now;
        // Reset window so the same extension doesn't re-trigger.
        leftDistRef.current = [];
        return { punch: 1, arm: "L" };
      }
      if (rV > PUNCH_VELOCITY) {
        lastPunchRef.current = now;
        rightDistRef.current = [];
        return { punch: 1, arm: "R" };
      }
      return { punch: 0, arm: "" };
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      videoRef.current = null;
    };
  }, [enabled]);

  return { state, getPunch: () => punchRef.current, setTouch };
}
