// FBX → VRM animation retargeting.
//
// VRM ships a *normalized* humanoid rig (a canonical T-pose skeleton) that
// lives inside `vrm.scene` as `humanoid.normalizedHumanBonesRoot`, with each
// normalized bone node named `"Normalized_" + <rawBoneName>` (see three-vrm
// `VRMHumanoidRig`). Because the normalized rig is parented under `vrm.scene`,
// an `AnimationMixer` rooted at `vrm.scene` can resolve retargeted tracks by
// node name. `vrm.humanoid.update()` then propagates normalized poses to the
// raw (rendered) bones (`autoUpdateHumanBones`).
//
// Mixamo / Blender FBX animations bake rotations onto bones named per a
// de-facto convention ("Hips", "Spine", "LeftArm", ...). We remap each
// KeyframeTrack's node name to the matching VRM normalized bone node name,
// so an AnimationMixer bound to the VRM can play the clip.
//
// Scope: only QUATERNION (rotation) tracks are retained. Position tracks
// (cm-scale root translation in Mixamo) are dropped — root motion is owned by
// the ActionController (walk interpolation), not the clip. This keeps
// retargeting robust across arbitrary source rigs.

import * as THREE from "three";
import { VRMHumanBoneName, type VRMHumanBoneName as BoneName, type VRM } from "@pixiv/three-vrm";

/**
 * Mixamo / Blender bone name → VRM humanoid bone name.
 * Extend this map to support more source rigs (Open/Closed: add entries, do
 * not branch elsewhere).
 */
export const MIXAMO_TO_VRM: Record<string, BoneName> = {
  // torso
  Hips: VRMHumanBoneName.Hips,
  Spine: VRMHumanBoneName.Spine,
  Spine1: VRMHumanBoneName.Chest,
  Spine2: VRMHumanBoneName.UpperChest,
  Neck: VRMHumanBoneName.Neck,
  Head: VRMHumanBoneName.Head,
  // left arm
  LeftShoulder: VRMHumanBoneName.LeftShoulder,
  LeftArm: VRMHumanBoneName.LeftUpperArm,
  LeftForeArm: VRMHumanBoneName.LeftLowerArm,
  LeftHand: VRMHumanBoneName.LeftHand,
  // right arm
  RightShoulder: VRMHumanBoneName.RightShoulder,
  RightArm: VRMHumanBoneName.RightUpperArm,
  RightForeArm: VRMHumanBoneName.RightLowerArm,
  RightHand: VRMHumanBoneName.RightHand,
  // left leg
  LeftUpLeg: VRMHumanBoneName.LeftUpperLeg,
  LeftLeg: VRMHumanBoneName.LeftLowerLeg,
  LeftFoot: VRMHumanBoneName.LeftFoot,
  LeftToeBase: VRMHumanBoneName.LeftToes,
  // right leg
  RightUpLeg: VRMHumanBoneName.RightUpperLeg,
  RightLeg: VRMHumanBoneName.RightLowerLeg,
  RightFoot: VRMHumanBoneName.RightFoot,
  RightToeBase: VRMHumanBoneName.RightToes,
};

/** Strip a "mixamorig:" / "mixamorig" prefix (with or without colon, any case)
 * that Mixamo FBX rigs carry. Some exporters use "mixamorig:Hips",
 * others "mixamorigHips". */
export function normalizeBoneName(raw: string): string {
  return raw.replace(/^mixamorig:?/i, "").trim();
}

/** Resolve a source-rig bone name to a VRM normalized bone node, if any. */
function resolveVrmNode(
  boneName: string,
  vrm: VRM,
): THREE.Object3D | null {
  const vrmBoneName = MIXAMO_TO_VRM[normalizeBoneName(boneName)];
  if (!vrmBoneName) return null;
  return vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
}

/**
 * Retarget a single FBX AnimationClip onto a VRM's normalized humanoid rig.
 * Returns a new clip whose quaternion tracks target VRM bone nodes; returns
 * null if no tracks could be mapped (e.g. incompatible rig).
 */
export function retargetClipToVrm(
  clip: THREE.AnimationClip,
  vrm: VRM,
): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];

  for (const track of clip.tracks) {
    const dot = track.name.indexOf(".");
    if (dot < 0) continue;
    const boneName = track.name.slice(0, dot);
    const property = track.name.slice(dot + 1);

    // Rotation only — see module doc.
    if (property !== "quaternion") continue;

    const node = resolveVrmNode(boneName, vrm);
    if (!node) continue;

    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${node.name}.quaternion`,
        track.times,
        track.values,
      ),
    );
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Retarget every clip in an FBX rig, keyed by the original clip name.
 * Clips that fail to retarget are omitted from the map.
 */
export function retargetClipsToVrm(
  clips: THREE.AnimationClip[],
  vrm: VRM,
): Map<string, THREE.AnimationClip> {
  const map = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    const retargeted = retargetClipToVrm(clip, vrm);
    if (retargeted) map.set(clip.name, retargeted);
  }
  return map;
}
