// Procedural VRM pose helpers — shared by VrmFigure (fully procedural) and
// VrmFbxFigure (procedural idle fallback when the FBX has no idle clip).
//
// All poses are applied to the VRM's NORMALIZED humanoid bones; the VRM's
// `humanoid.update()` then propagates them to the rendered raw bones.
// Extracted here so the two figure components don't duplicate the bone list
// or the pose math (DRY).

import type { Object3D } from "three";
import {
  VRMHumanBoneName,
  type VRMHumanBoneName as BoneName,
  type VRM,
} from "@pixiv/three-vrm";

/** The humanoid bones the procedural poses drive (a calm subset). */
export const VRM_BONE_NAMES: BoneName[] = [
  VRMHumanBoneName.Hips,
  VRMHumanBoneName.Spine,
  VRMHumanBoneName.Chest,
  VRMHumanBoneName.UpperChest,
  VRMHumanBoneName.Neck,
  VRMHumanBoneName.Head,
  VRMHumanBoneName.LeftShoulder,
  VRMHumanBoneName.LeftUpperArm,
  VRMHumanBoneName.LeftLowerArm,
  VRMHumanBoneName.LeftHand,
  VRMHumanBoneName.RightShoulder,
  VRMHumanBoneName.RightUpperArm,
  VRMHumanBoneName.RightLowerArm,
  VRMHumanBoneName.RightHand,
  VRMHumanBoneName.LeftUpperLeg,
  VRMHumanBoneName.LeftLowerLeg,
  VRMHumanBoneName.RightUpperLeg,
  VRMHumanBoneName.RightLowerLeg,
];

export type VrmBones = Partial<Record<BoneName, Object3D>>;

/** Resolve the normalized bone nodes for the subset we animate. */
export function collectVrmBones(vrm: VRM): VrmBones {
  const b: VrmBones = {};
  for (const name of VRM_BONE_NAMES) {
    b[name] = vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
  }
  return b;
}

/** Zero every tracked bone's rotation (call before applying a pose). */
export function resetVrmBones(b: VrmBones): void {
  for (const bone of Object.values(b)) {
    if (bone) bone.rotation.set(0, 0, 0);
  }
}

/**
 * Calm resting pose: gentle breathing + slight head/arm sway.
 * `t` is seconds since the action started.
 */
export function applyVrmIdlePose(b: VrmBones, t: number): void {
  const hips = b[VRMHumanBoneName.Hips];
  const chest = b[VRMHumanBoneName.Chest];
  const head = b[VRMHumanBoneName.Head];
  const lArm = b[VRMHumanBoneName.LeftUpperArm];
  const rArm = b[VRMHumanBoneName.RightUpperArm];
  if (!hips) return;
  hips.rotation.y = Math.sin(t * 1.5) * 0.04;
  if (chest) chest.rotation.z = Math.sin(t * 1.5) * 0.02;
  if (head) head.rotation.y = Math.sin(t * 0.8) * 0.1;
  if (lArm) lArm.rotation.z = -0.05 - Math.sin(t * 1.5) * 0.02;
  if (rArm) rArm.rotation.z = 0.05 + Math.sin(t * 1.5) * 0.02;
}

/**
 * Procedural walk limb swing. `t` is seconds since the walk started; the root
 * translation is owned by the controller (walk interpolation), not this pose.
 */
export function applyVrmWalkPose(b: VrmBones, t: number): void {
  const cycle = t * 8;
  const lUL = b[VRMHumanBoneName.LeftUpperLeg];
  const rUL = b[VRMHumanBoneName.RightUpperLeg];
  const lLL = b[VRMHumanBoneName.LeftLowerLeg];
  const rLL = b[VRMHumanBoneName.RightLowerLeg];
  const lUA = b[VRMHumanBoneName.LeftUpperArm];
  const rUA = b[VRMHumanBoneName.RightUpperArm];
  if (lUL) lUL.rotation.x = Math.sin(cycle) * 0.4;
  if (rUL) rUL.rotation.x = -Math.sin(cycle) * 0.4;
  if (lLL) lLL.rotation.x = Math.max(0, -Math.sin(cycle)) * 0.5;
  if (rLL) rLL.rotation.x = Math.max(0, Math.sin(cycle)) * 0.5;
  if (lUA) lUA.rotation.x = -Math.sin(cycle) * 0.3;
  if (rUA) rUA.rotation.x = Math.sin(cycle) * 0.3;
}
