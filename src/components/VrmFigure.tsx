"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import type { Group } from "three";
import { controller } from "@/lib/actions";
import { type FigureProps, registerFigure } from "@/lib/figure-registry";
import {
  collectVrmBones,
  resetVrmBones,
  applyVrmIdlePose,
  applyVrmWalkPose,
  type VrmBones,
} from "@/lib/three/vrm-procedural";

/**
 * VRM humanoid figure with procedural locomotion (idle + walk) and facial
 * lipsync via the expression preset "a". The action set lives in the
 * character manifest; this component only implements locomotion mechanics —
 * VRM-with-clips is handled by VrmFbxFigure.
 *
 * Registered for modelType="vrm" (Strategy registry). Contract: `modelPath`
 * is present for every vrm character.
 */
export function VrmFigure({ modelPath, baseY }: FigureProps) {
  const group = useRef<Group>(null);
  const bones = useRef<VrmBones>({});
  const vrmRef = useRef<VRM | null>(null);
  const mouthOpenRef = useRef(0);

  // Cast sidesteps a three-stdlib / @types/three KTX2Loader type conflict;
  // runtime is unaffected. The VRM object lands on gltf.userData.vrm (the
  // GLTF root), NOT scene.userData.vrm — drei returns the full GLTF result.
  const gltf = useGLTF(modelPath!, undefined, undefined, (loader) => {
    (loader.register as unknown as (p: unknown) => void)(
      (parser: unknown) => new VRMLoaderPlugin(parser as never),
    );
  }) as { scene: Group; userData: Record<string, unknown> };
  const scene = gltf.scene;

  useEffect(() => {
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) return;
    vrmRef.current = vrm;
    // VRM 0.x loads facing -Z; rotate so the face points +Z.
    VRMUtils.rotateVRM0(vrm);
    bones.current = collectVrmBones(vrm);
    scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [gltf, scene]);

  useFrame((state) => {
    const r = group.current;
    if (!r) return;
    const b = bones.current;
    const hips = b.hips;
    if (!hips) return;

    const vrm = vrmRef.current;
    vrm?.update(1 / 60);

    const s = controller.getState();
    const t = (performance.now() - s.startedAt) / 1000;

    const cam = state.camera.position;
    const cameraFaceY = Math.atan2(cam.x - s.position.x, cam.z - s.position.z);
    const faceY = s.facing ?? cameraFaceY;
    r.position.set(s.position.x, baseY, s.position.z);
    r.rotation.set(0, faceY, 0);

    resetVrmBones(b);

    // Lipsync via VRM 0.x vowel expression "a".
    const target = controller.getMouth();
    const mouthOpen = mouthOpenRef.current + (target - mouthOpenRef.current) * 0.25;
    mouthOpenRef.current = mouthOpen;
    const expressions = vrm?.expressionManager;
    if (expressions) {
      expressions.setValue("a", mouthOpen);
      expressions.setValue("u", mouthOpen * 0.5);
    }

    switch (s.current) {
      case "idle": {
        applyVrmIdlePose(b, t);
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
        applyVrmWalkPose(b, t);
        r.position.y = baseY + Math.abs(Math.sin(t * 8)) * 0.04;
        break;
      }
    }
  });

  return (
    <group ref={group} position={[0, baseY, 0]}>
      <primitive object={scene} />
    </group>
  );
}

registerFigure("vrm", VrmFigure);
