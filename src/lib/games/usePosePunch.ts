"use client";

import { useEffect, useRef, useState } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * MediaPipe PoseLandmarker hook — detects a kid's "kick", "jump", and "run"
 * actions from webcam pose, with a keyboard fallback so the game is always
 * testable.
 *
 * Detection strategy (robust for kids, no ML model training needed):
 * - KICK: an ankle rises above its knee (foot comes up). Triggers once per rise
 *   (debounced 400ms) so one kick = one blast, not a stream.
 * - JUMP: both hips rise quickly above a calibrated standing baseline. Triggers
 *   once per jump (debounced 700ms — jumps are slower to reset than kicks).
 * - RUN: horizontal hip-centre velocity (mirrored for selfie view).
 *
 * The hook owns the webcam + model lifecycle and exposes a tiny state object
 * the game polls each frame. No React re-renders during play — the consumer
 * reads refs via getPose() in its update loop.
 */

export interface PoseState {
  /** 1 = fresh kick this frame (debounced). */
  kick: number;
  /** 1 = fresh jump this frame (debounced). */
  jump: number;
  /** -1..1 run direction (-1 left, 1 right, 0 still). */
  run: number;
  /** True while the webcam + model are live. */
  ready: boolean;
  /** Last error message, if the camera/model failed to start. */
  error: string | null;
}

const NO_POSE: PoseState = { kick: 0, jump: 0, run: 0, ready: false, error: null };

const POSE_LANDMARKS = {
  nose: 0,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const KICK_COOLDOWN_MS = 400;
const JUMP_COOLDOWN_MS = 700;
const JUMP_RISE_THRESHOLD = 0.06; // hips rise (normalized y) above baseline

export function usePosePunch(enabled: boolean) {
  const [state, setState] = useState<PoseState>(NO_POSE);
  const poseRef = useRef<PoseState>({ kick: 0, jump: 0, run: 0, ready: false, error: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastKickRef = useRef(0);
  const lastJumpRef = useRef(0);
  const hipBaselineRef = useRef<number | null>(null);
  const hipHistoryRef = useRef<{ x: number; t: number }[]>([]);

  // Keyboard fallback state (always active — lets you test without a camera).
  const keysRef = useRef<Record<string, boolean>>({});

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
    if (!enabled) {
      // Keyboard-only mode.
      const loop = () => {
        const k = keysRef.current;
        let run = 0;
        if (k["ArrowLeft"] || k["KeyA"]) run -= 1;
        if (k["ArrowRight"] || k["KeyD"]) run += 1;
        run = Math.max(-1, Math.min(1, run));
        const kick = k["Space"] ? 1 : 0;
        const jump = k["ArrowUp"] || k["KeyW"] ? 1 : 0;
        const next: PoseState = { kick, jump, run, ready: true, error: null };
        poseRef.current = next;
        setState(next);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        // 1. Webcam
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

        // 2. MediaPipe PoseLandmarker (loaded from CDN — the wasm/model assets).
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

        // 3. Detection loop
        const loop = () => {
          if (cancelled) return;
          const lm = landmarkerRef.current;
          const v = videoRef.current;
          if (!lm || !v || v.readyState < 2) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }
          const result = lm.detectForVideo(v, performance.now());
          const k = keysRef.current; // keyboard can still augment

          let kick = 0;
          let jump = 0;
          let run = 0;

          if (result.landmarks && result.landmarks.length > 0) {
            const pts = result.landmarks[0];
            const lHip = pts[POSE_LANDMARKS.leftHip];
            const rHip = pts[POSE_LANDMARKS.rightHip];
            const lKnee = pts[POSE_LANDMARKS.leftKnee];
            const rKnee = pts[POSE_LANDMARKS.rightKnee];
            const lAnkle = pts[POSE_LANDMARKS.leftAnkle];
            const rAnkle = pts[POSE_LANDMARKS.rightAnkle];
            const now = performance.now();

            // KICK: an ankle rises above (lower y than) its knee. Kids lift a
            // foot forward+up; this fires reliably without velocity math.
            const lKick = lAnkle && lKnee && lAnkle.y < lKnee.y - 0.02;
            const rKick = rAnkle && rKnee && rAnkle.y < rKnee.y - 0.02;
            if ((lKick || rKick) && now - lastKickRef.current > KICK_COOLDOWN_MS) {
              lastKickRef.current = now;
              kick = 1;
            }

            // JUMP: hip centre rises above the standing baseline. Calibrate the
            // baseline from the highest (smallest y) hip position seen recently,
            // so standing tall resets the baseline and a dip-then-rise counts.
            const hipY = (lHip.y + rHip.y) / 2;
            if (
              hipBaselineRef.current === null ||
              hipY < hipBaselineRef.current
            ) {
              hipBaselineRef.current = hipY; // track the tallest stance
            }
            if (
              hipBaselineRef.current !== null &&
              hipY < hipBaselineRef.current - JUMP_RISE_THRESHOLD &&
              now - lastJumpRef.current > JUMP_COOLDOWN_MS
            ) {
              lastJumpRef.current = now;
              jump = 1;
              // Reset baseline so the kid must land + rise again for the next jump.
              hipBaselineRef.current = null;
            }

            // RUN: horizontal hip centre velocity.
            const hipX = (lHip.x + rHip.x) / 2;
            const t = now;
            hipHistoryRef.current.push({ x: hipX, t });
            if (hipHistoryRef.current.length > 8) hipHistoryRef.current.shift();
            if (hipHistoryRef.current.length >= 2) {
              const first = hipHistoryRef.current[0];
              const last = hipHistoryRef.current[hipHistoryRef.current.length - 1];
              const dt = (last.t - first.t) / 1000;
              if (dt > 0) {
                const vx = (last.x - first.x) / dt; // normalized x per sec
                // Mirror: webcam is mirrored, so rightward body = leftward screen.
                run = Math.max(-1, Math.min(1, -vx * 6));
              }
            }
          }

          // Keyboard augments / overrides for testing.
          if (k["ArrowLeft"] || k["KeyA"]) run -= 1;
          if (k["ArrowRight"] || k["KeyD"]) run += 1;
          run = Math.max(-1, Math.min(1, run));
          if (k["Space"]) kick = Math.max(kick, 1);
          if (k["ArrowUp"] || k["KeyW"]) jump = Math.max(jump, 1);

          const next: PoseState = { kick, jump, run, ready: true, error: null };
          poseRef.current = next;
          setState(next);
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        const next: PoseState = {
          kick: 0,
          jump: 0,
          run: 0,
          ready: false,
          error: `Camera unavailable: ${msg}. Using keyboard (arrows + space/up).`,
        };
        poseRef.current = { ...next, ready: true };
        setState(next);
        // Fall back to keyboard loop.
        startKeyboardFallback();
      }
    }

    function startKeyboardFallback() {
      const loop = () => {
        if (cancelled) return;
        const k = keysRef.current;
        let run = 0;
        if (k["ArrowLeft"] || k["KeyA"]) run -= 1;
        if (k["ArrowRight"] || k["KeyD"]) run += 1;
        run = Math.max(-1, Math.min(1, run));
        const kick = k["Space"] ? 1 : 0;
        const jump = k["ArrowUp"] || k["KeyW"] ? 1 : 0;
        const next: PoseState = { kick, jump, run, ready: true, error: null };
        poseRef.current = next;
        setState(next);
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
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

  return { state, getPose: () => poseRef.current };
}
