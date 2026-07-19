"use client";

import { useEffect, useRef, useState } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

/**
 * MediaPipe PoseLandmarker hook — detects a kid's "kick", "jump", and "run"
 * actions from webcam pose, with a keyboard/touch fallback so the game is
 * always playable (desktop without a camera, or mobile where pose is hard).
 *
 * IMPORTANT: the keyboard/touch fallback is ALWAYS active. Camera detection
 * augments it but never gates it — so if the camera or MediaPipe CDN fails
 * (common on mobile / strict networks), the game still responds to input.
 *
 * Detection:
 * - KICK: an ankle rises above its knee (debounced 400ms).
 * - JUMP: hip centre rises above a calibrated baseline (debounced 700ms).
 * - RUN: horizontal hip-centre velocity (mirrored for selfie view).
 *
 * Keyboard: Space=kick, ArrowUp/W=jump, ArrowLeft/Right (or A/D)=run.
 * Touch: a virtual D-pad + buttons are wired by JungleBlastGame via setTouch().
 */

export interface PoseState {
  /** 1 = fresh kick this frame (debounced). */
  kick: number;
  /** 1 = fresh jump this frame (debounced). */
  jump: number;
  /** -1..1 run direction (-1 left, 1 right, 0 still). */
  run: number;
  /** True while the hook is producing input (always true once mounted). */
  ready: boolean;
  /** Last error message, if the camera/model failed to start. */
  error: string | null;
}

const NO_POSE: PoseState = { kick: 0, jump: 0, run: 0, ready: false, error: null };

const POSE_LANDMARKS = {
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const KICK_COOLDOWN_MS = 400;
const JUMP_COOLDOWN_MS = 700;
const JUMP_RISE_THRESHOLD = 0.04; // hips rise (normalized y) below the rolling average
const KICK_THRESHOLD = 0.04; // knee/ankle rises this far above (lower y than) hip/knee

/** Touch input set externally by on-screen controls (mobile). */
interface TouchInput {
  run: number; // -1, 0, 1
  kick: boolean;
  jump: boolean;
}

export function usePosePunch(enabled: boolean) {
  const [state, setState] = useState<PoseState>(NO_POSE);
  const poseRef = useRef<PoseState>({ kick: 0, jump: 0, run: 0, ready: false, error: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastKickRef = useRef(0);
  const lastJumpRef = useRef(0);
  const hipAvgRef = useRef<number[]>([]); // rolling hipY samples for jump baseline
  const hipHistoryRef = useRef<{ x: number; t: number }[]>([]);

  // Keyboard + touch input (always active so the game is playable without a camera).
  const keysRef = useRef<Record<string, boolean>>({});
  const touchRef = useRef<TouchInput>({ run: 0, kick: false, jump: false });

  /** External touch controls call this to set on-screen button state. */
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
    // The core per-frame input loop. Keyboard + touch ALWAYS work; camera
    // augments on top. This runs whether or not a camera/MediaPipe is available.
    function coreLoop(cameraDetect: (() => { kick: number; jump: number; run: number }) | null) {
      return () => {
        if (cancelled) return;
        const k = keysRef.current;
        const t = touchRef.current;

        let kick = 0;
        let jump = 0;
        let run = 0;

        // Camera-driven detection (best-effort; failures don't block input).
        if (cameraDetect) {
          try {
            const c = cameraDetect();
            kick = Math.max(kick, c.kick);
            jump = Math.max(jump, c.jump);
            run += c.run;
          } catch {
            // ignore transient detection errors
          }
        }

        // Keyboard: always active.
        if (k["ArrowLeft"] || k["KeyA"]) run -= 1;
        if (k["ArrowRight"] || k["KeyD"]) run += 1;
        if (k["Space"]) kick = Math.max(kick, 1);
        if (k["ArrowUp"] || k["KeyW"]) jump = Math.max(jump, 1);

        // Touch: always active (mobile on-screen buttons).
        if (t.run !== 0) run += t.run;
        if (t.kick) kick = Math.max(kick, 1);
        if (t.jump) jump = Math.max(jump, 1);

        run = Math.max(-1, Math.min(1, run));

        const next: PoseState = { kick, jump, run, ready: true, error: null };
        poseRef.current = next;
        setState(next);
        rafRef.current = requestAnimationFrame(coreLoop(cameraDetect));
      };
    }

    let cancelled = false;
    let stream: MediaStream | null = null;

    async function start() {
      // Start the keyboard/touch loop immediately so the game is playable
      // while the camera + model load (or forever, if they fail).
      rafRef.current = requestAnimationFrame(coreLoop(null));

      if (!enabled) return; // keyboard/touch-only mode

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

        // 2. MediaPipe PoseLandmarker (loaded from CDN).
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

        // 3. Swap the loop to one that also runs camera detection each frame.
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(coreLoop(cameraDetect));
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        // Camera/model failed — keep the keyboard/touch loop running, just
        // surface the error so the UI can tell the user.
        const next: PoseState = {
          kick: 0,
          jump: 0,
          run: 0,
          ready: true,
          error: `Camera unavailable: ${msg}. Use keyboard/touch controls.`,
        };
        poseRef.current = next;
        setState(next);
      }
    }

    /** Per-frame camera detection. Returns kick/jump/run from pose landmarks. */
    function cameraDetect(): { kick: number; jump: number; run: number } {
      const lm = landmarkerRef.current;
      const v = videoRef.current;
      if (!lm || !v || v.readyState < 2) return { kick: 0, jump: 0, run: 0 };

      const result = lm.detectForVideo(v, performance.now());
      if (!result.landmarks || result.landmarks.length === 0) {
        return { kick: 0, jump: 0, run: 0 };
      }
      const pts = result.landmarks[0];
      const lHip = pts[POSE_LANDMARKS.leftHip];
      const rHip = pts[POSE_LANDMARKS.rightHip];
      const lKnee = pts[POSE_LANDMARKS.leftKnee];
      const rKnee = pts[POSE_LANDMARKS.rightKnee];
      const lAnkle = pts[POSE_LANDMARKS.leftAnkle];
      const rAnkle = pts[POSE_LANDMARKS.rightAnkle];
      const now = performance.now();

      let kick = 0;
      let jump = 0;
      let run = 0;

      // KICK: a knee rises above (lower y than) its hip, OR an ankle rises above
      // its knee. The knee-raise is the PRIMARY trigger — it's the most reliable
      // kick signal from a front-facing webcam (a kid kicking forward lifts the
      // knee well above the hip), and the knee landmark is more stable than the
      // ankle on the lite model. Ankle-above-knee is a secondary, lower bar.
      const lKneeUp = lKnee && lHip && lKnee.y < lHip.y - KICK_THRESHOLD;
      const rKneeUp = rKnee && rHip && rKnee.y < rHip.y - KICK_THRESHOLD;
      const lAnkleUp = lAnkle && lKnee && lAnkle.y < lKnee.y - 0.02;
      const rAnkleUp = rAnkle && rKnee && rAnkle.y < rKnee.y - 0.02;
      if ((lKneeUp || rKneeUp || lAnkleUp || rAnkleUp) && now - lastKickRef.current > KICK_COOLDOWN_MS) {
        lastKickRef.current = now;
        kick = 1;
      }

      // JUMP: hip centre drops below a rolling average of recent hipY (not the
      // min — the min chases the tallest stance and makes the threshold
      // unreachable). Average resets after a jump so repeated jumps work.
      const hipY = (lHip.y + rHip.y) / 2;
      hipAvgRef.current.push(hipY);
      if (hipAvgRef.current.length > 30) hipAvgRef.current.shift();
      const avg =
        hipAvgRef.current.reduce((a, b) => a + b, 0) / hipAvgRef.current.length;
      if (hipY < avg - JUMP_RISE_THRESHOLD && now - lastJumpRef.current > JUMP_COOLDOWN_MS) {
        lastJumpRef.current = now;
        jump = 1;
        // Reset the average so the kid must settle before the next jump registers.
        hipAvgRef.current = [];
      }

      // RUN: horizontal hip-centre velocity (mirrored for selfie).
      const hipX = (lHip.x + rHip.x) / 2;
      hipHistoryRef.current.push({ x: hipX, t: now });
      if (hipHistoryRef.current.length > 8) hipHistoryRef.current.shift();
      if (hipHistoryRef.current.length >= 2) {
        const first = hipHistoryRef.current[0];
        const last = hipHistoryRef.current[hipHistoryRef.current.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0) {
          const vx = (last.x - first.x) / dt;
          run = Math.max(-1, Math.min(1, -vx * 6));
        }
      }

      return { kick, jump, run };
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

  return { state, getPose: () => poseRef.current, setTouch };
}
