"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  VRMLoaderPlugin,
  VRMUtils,
  VRMHumanBoneName,
  type VRM,
} from "@pixiv/three-vrm";
import type { Group, Object3D } from "three";
import { controller } from "@/lib/actions";

interface Props {
  modelPath: string;
  baseY: number;
}

/**
 * VRM humanoid figure with procedural locomotion (idle + walk) and facial
 * lipsync via Blendshape/expression preset "a". Action set lives in the
 * character manifesto; this component only implements locomotion mechanics.
 */
export function VrmFigure({ modelPath, baseY }: Props) {
  const group = useRef<Group>(null);
  const bones = useRef<Partial<Record<VRMHumanBoneName, Object3D>>>({});
  const vrmRef = useRef<VRM | null>(null);
  const mouthOpenRef = useRef(0);

  // Cast sidesteps a three-stdlib / @types/three KTX2Loader type conflict;
  // runtime is unaffected. The VRM object lands on gltf.userData.vrm (the
  // GLTF root), NOT scene.userData.vrm — drei returns the full GLTF result.
  const gltf = useGLTF(modelPath, undefined, undefined, (loader) => {
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
    const named = (n: VRMHumanBoneName) =>
      vrm.humanoid.getNormalizedBoneNode(n) ?? undefined;
    bones.current = {
      hips: named(VRMHumanBoneName.Hips),
      spine: named(VRMHumanBoneName.Spine),
      chest: named(VRMHumanBoneName.Chest),
      upperChest: named(VRMHumanBoneName.UpperChest),
      neck: named(VRMHumanBoneName.Neck),
      head: named(VRMHumanBoneName.Head),
      leftShoulder: named(VRMHumanBoneName.LeftShoulder),
      leftUpperArm: named(VRMHumanBoneName.LeftUpperArm),
      leftLowerArm: named(VRMHumanBoneName.LeftLowerArm),
      leftHand: named(VRMHumanBoneName.LeftHand),
      rightShoulder: named(VRMHumanBoneName.RightShoulder),
      rightUpperArm: named(VRMHumanBoneName.RightUpperArm),
      rightLowerArm: named(VRMHumanBoneName.RightLowerArm),
      rightHand: named(VRMHumanBoneName.RightHand),
      leftUpperLeg: named(VRMHumanBoneName.LeftUpperLeg),
      leftLowerLeg: named(VRMHumanBoneName.LeftLowerLeg),
      rightUpperLeg: named(VRMHumanBoneName.RightUpperLeg),
      rightLowerLeg: named(VRMHumanBoneName.RightLowerLeg),
    };
    scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [gltf]);

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

    for (const bone of Object.values(b)) {
      if (bone) bone.rotation.set(0, 0, 0);
    }

    // Lipsync via VRM 0.x vowel expression "a".
    const target = controller.getMouth();
    const mouthOpen =
      mouthOpenRef.current + (target - mouthOpenRef.current) * 0.25;
    mouthOpenRef.current = mouthOpen;
    const expressions = vrm?.expressionManager;
    if (expressions) {
      expressions.setValue("a", mouthOpen);
      expressions.setValue("u", mouthOpen * 0.5);
    }

    switch (s.current) {
      case "idle": {
        hips.rotation.y = Math.sin(t * 1.5) * 0.04;
        if (b.chest) b.chest.rotation.z = Math.sin(t * 1.5) * 0.02;
        if (b.head) b.head.rotation.y = Math.sin(t * 0.8) * 0.1;
        if (b.leftUpperArm)
          b.leftUpperArm.rotation.z = -0.05 - Math.sin(t * 1.5) * 0.02;
        if (b.rightUpperArm)
          b.rightUpperArm.rotation.z = 0.05 + Math.sin(t * 1.5) * 0.02;
        break;
      }
      case "walk": {
        const d = s.durationMs / 1000;
        const p = Math.min(t / d, 1);
        const eased =
          p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        if (s.walk) {
          r.position.x = s.walk.from.x + (s.walk.to.x - s.walk.from.x) * eased;
          r.position.z = s.walk.from.z + (s.walk.to.z - s.walk.from.z) * eased;
        }
        const cycle = t * 8;
        if (b.leftUpperLeg) b.leftUpperLeg.rotation.x = Math.sin(cycle) * 0.4;
        if (b.rightUpperLeg) b.rightUpperLeg.rotation.x = -Math.sin(cycle) * 0.4;
        if (b.leftLowerLeg)
          b.leftLowerLeg.rotation.x = Math.max(0, -Math.sin(cycle)) * 0.5;
        if (b.rightLowerLeg)
          b.rightLowerLeg.rotation.x = Math.max(0, Math.sin(cycle)) * 0.5;
        if (b.leftUpperArm) b.leftUpperArm.rotation.x = -Math.sin(cycle) * 0.3;
        if (b.rightUpperArm)
          b.rightUpperArm.rotation.x = Math.sin(cycle) * 0.3;
        r.position.y = baseY + Math.abs(Math.sin(cycle)) * 0.04;
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
