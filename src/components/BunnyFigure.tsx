"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { controller } from "@/lib/actions";
import type { FigureProps } from "@/lib/figure-registry";
import { registerFigure } from "@/lib/figure-registry";
// Soft default; overridden by character manifesto.

const CREAM = "#f5ead3";
const CREAM_DARK = "#e8d4b0";
const PINK = "#f9a8d4";
const PINK_DARK = "#ec4899";
const DARK = "#1e293b";

/**
 * Bunny figure — built from primitives, procedural motions. Reads
 * `controller.getState()` every frame and animates the mesh refs; no React
 * re-renders during animation.
 */
export function BunnyFigure({ baseY = 0.8 }: FigureProps) {
  const BASE_Y = baseY;
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const leftEar = useRef<Group>(null);
  const rightEar = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const mouth = useRef<Group>(null);
  const mouthOpenRef = useRef(0);

  useFrame((state) => {
    const r = root.current;
    if (!r) return;
    const b = body.current;
    const h = head.current;
    const le = leftEar.current;
    const re = rightEar.current;
    const la = leftArm.current;
    const ra = rightArm.current;
    const m = mouth.current;
    if (!b || !h || !le || !re || !la || !ra || !m) return;

    const s = controller.getState();
    const t = (performance.now() - s.startedAt) / 1000;

    const cam = state.camera.position;
    const cameraFaceY = Math.atan2(cam.x - s.position.x, cam.z - s.position.z);
    const faceY = s.facing ?? cameraFaceY;

    r.position.set(s.position.x, BASE_Y, s.position.z);
    r.rotation.set(0, faceY, 0);
    r.scale.set(1, 1, 1);
    b.rotation.set(0, 0, 0);
    h.rotation.set(0, 0, 0);
    le.rotation.set(0, 0, -0.12);
    re.rotation.set(0, 0, 0.12);
    la.rotation.set(0, 0, 0);
    ra.rotation.set(0, 0, 0);

    const target = controller.getMouth();
    const mouthOpen = mouthOpenRef.current + (target - mouthOpenRef.current) * 0.25;
    mouthOpenRef.current = mouthOpen;
    m.scale.y = 1 + mouthOpen * 2.2;
    m.scale.x = 1 + mouthOpen * 0.4;
    m.position.y = -0.12 - mouthOpen * 0.04;

    switch (s.current) {
      case "idle": {
        r.position.y = BASE_Y + Math.sin(t * 2) * 0.03;
        h.rotation.y = Math.sin(t * 1.2) * 0.12;
        h.rotation.x = Math.sin(t * 0.8) * 0.05;
        le.rotation.z = -0.12 + Math.sin(t * 3) * 0.08;
        re.rotation.z = 0.12 - Math.sin(t * 3) * 0.08;
        la.rotation.z = Math.sin(t * 2) * 0.05;
        ra.rotation.z = -Math.sin(t * 2) * 0.05;
        const twitch = Math.max(0, Math.sin(t * Math.PI));
        le.rotation.x = twitch * 0.2;
        break;
      }
      case "jump": {
        const d = 0.9;
        const p = Math.min(t / d, 1);
        const peak = 1.4;
        r.position.y = BASE_Y + 4 * peak * p * (1 - p);
        const earsBack = Math.sin(p * Math.PI) * 0.5;
        le.rotation.x = earsBack;
        re.rotation.x = earsBack;
        la.rotation.z = 1.4;
        ra.rotation.z = -1.4;
        if (p < 0.12 || p > 0.88) r.scale.set(1.15, 0.85, 1.15);
        break;
      }
      case "wave": {
        r.position.y = BASE_Y + Math.sin(t * 2) * 0.03;
        ra.rotation.x = -1.9;
        ra.rotation.z = 0.2 + Math.sin(t * 12) * 0.5;
        h.rotation.z = Math.sin(t * 5) * 0.1;
        h.rotation.y = Math.sin(t * 3) * 0.08;
        re.rotation.z = 0.12 + Math.sin(t * 12) * 0.15;
        break;
      }
      case "spin": {
        const d = 1.2;
        const p = Math.min(t / d, 1);
        r.rotation.y = faceY + p * Math.PI * 2;
        la.rotation.z = 1.2;
        ra.rotation.z = -1.2;
        le.rotation.z = -0.12 - 0.2 * Math.sin(p * Math.PI);
        re.rotation.z = 0.12 + 0.2 * Math.sin(p * Math.PI);
        break;
      }
      case "dance": {
        r.position.x = s.position.x + Math.sin(t * 4) * 0.3;
        r.position.y = BASE_Y + Math.abs(Math.sin(t * 8)) * 0.1;
        b.rotation.z = Math.sin(t * 4) * 0.12;
        la.rotation.z = 0.5 + Math.sin(t * 4) * 0.7;
        ra.rotation.z = -0.5 - Math.sin(t * 4) * 0.7;
        h.rotation.z = Math.sin(t * 4 + 1) * 0.15;
        le.rotation.x = Math.abs(Math.sin(t * 8)) * 0.3;
        re.rotation.x = Math.abs(Math.sin(t * 8 + 0.3)) * 0.3;
        break;
      }
      case "play": {
        r.position.y = BASE_Y + Math.abs(Math.sin(t * 6)) * 0.35;
        r.rotation.z = Math.sin(t * 6) * 0.06;
        la.rotation.z = 1.8 + Math.sin(t * 12) * 0.3;
        ra.rotation.z = -1.8 - Math.sin(t * 12) * 0.3;
        le.rotation.x = Math.sin(t * 12) * 0.4;
        re.rotation.x = -Math.sin(t * 12) * 0.4;
        break;
      }
      case "walk": {
        const d = s.durationMs / 1000;
        const p = Math.min(t / d, 1);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        if (s.walk) {
          r.position.x = s.walk.from.x + (s.walk.to.x - s.walk.from.x) * eased;
          r.position.z = s.walk.from.z + (s.walk.to.z - s.walk.from.z) * eased;
        }
        const cycle = t * 8;
        r.position.y = BASE_Y + Math.abs(Math.sin(cycle)) * 0.08;
        b.rotation.z = Math.sin(cycle) * 0.08;
        la.rotation.z = 0.4 + Math.sin(cycle) * 0.5;
        ra.rotation.z = -0.4 - Math.sin(cycle) * 0.5;
        le.rotation.x = Math.sin(cycle) * 0.25;
        re.rotation.x = -Math.sin(cycle) * 0.25;
        h.rotation.y = Math.sin(cycle) * 0.06;
        break;
      }
    }
  });

  return (
    <group ref={root} position={[0, BASE_Y, 0]}>
      <group ref={body}>
        <mesh castShadow position={[0, 0, 0]}>
          <sphereGeometry args={[0.5, 24, 24]} />
          <meshStandardMaterial color={CREAM} roughness={0.7} />
        </mesh>
        <mesh position={[0, -0.08, 0.18]}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color="#fbf3e2" roughness={0.8} />
        </mesh>

        <group ref={head} position={[0, 0.8, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.45, 24, 24]} />
            <meshStandardMaterial color={CREAM} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.05, 0.35]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color="#fbf3e2" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.02, 0.48]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color={PINK_DARK} roughness={0.5} />
          </mesh>
          <mesh position={[-0.17, 0.12, 0.36]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color={DARK} roughness={0.2} />
          </mesh>
          <mesh position={[0.17, 0.12, 0.36]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color={DARK} roughness={0.2} />
          </mesh>
          <mesh position={[-0.15, 0.15, 0.42]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0.19, 0.15, 0.42]}>
            <sphereGeometry args={[0.022, 8, 8]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[-0.3, -0.02, 0.28]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={PINK} transparent opacity={0.5} roughness={0.9} />
          </mesh>
          <mesh position={[0.3, -0.02, 0.28]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={PINK} transparent opacity={0.5} roughness={0.9} />
          </mesh>
          <group ref={mouth} position={[0, -0.12, 0.42]}>
            <mesh>
              <sphereGeometry args={[0.09, 16, 12]} />
              <meshStandardMaterial color={PINK_DARK} roughness={0.6} />
            </mesh>
          </group>
          <group ref={leftEar} position={[-0.18, 0.4, 0]}>
            <mesh castShadow position={[0, 0.35, 0]}>
              <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
              <meshStandardMaterial color={CREAM} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.35, 0.05]}>
              <capsuleGeometry args={[0.05, 0.4, 6, 12]} />
              <meshStandardMaterial color={PINK} roughness={0.8} />
            </mesh>
          </group>
          <group ref={rightEar} position={[0.18, 0.4, 0]}>
            <mesh castShadow position={[0, 0.35, 0]}>
              <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
              <meshStandardMaterial color={CREAM} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0.35, 0.05]}>
              <capsuleGeometry args={[0.05, 0.4, 6, 12]} />
              <meshStandardMaterial color={PINK} roughness={0.8} />
            </mesh>
          </group>
        </group>

        <group ref={leftArm} position={[-0.45, 0.1, 0]}>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.11, 0.22, 6, 12]} />
            <meshStandardMaterial color={CREAM_DARK} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.32, 0.02]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={CREAM} roughness={0.7} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.45, 0.1, 0]}>
          <mesh castShadow position={[0, -0.18, 0]}>
            <capsuleGeometry args={[0.11, 0.22, 6, 12]} />
            <meshStandardMaterial color={CREAM_DARK} roughness={0.7} />
          </mesh>
          <mesh position={[0, -0.32, 0.02]}>
            <sphereGeometry args={[0.12, 12, 12]} />
            <meshStandardMaterial color={CREAM} roughness={0.7} />
          </mesh>
        </group>

        <mesh castShadow position={[-0.22, -0.55, 0.12]} scale={[1, 0.55, 1.4]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshStandardMaterial color={CREAM_DARK} roughness={0.7} />
        </mesh>
        <mesh castShadow position={[0.22, -0.55, 0.12]} scale={[1, 0.55, 1.4]}>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshStandardMaterial color={CREAM_DARK} roughness={0.7} />
        </mesh>
        <mesh position={[-0.22, -0.62, 0.22]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color={PINK} roughness={0.8} />
        </mesh>
        <mesh position={[0.22, -0.62, 0.22]}>
          <sphereGeometry args={[0.05, 12, 12]} />
          <meshStandardMaterial color={PINK} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.05, -0.45]}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color="#ffffff" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}
