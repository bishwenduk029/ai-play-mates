"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useFBX } from "@react-three/drei";
import type { Group, AnimationClip, AnimationAction } from "three";
import { AnimationMixer } from "three";
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import { controller } from "@/lib/actions";
import { type FigureProps, registerFigure } from "@/lib/figure-registry";
import { retargetClipsToVrm } from "@/lib/three/vrm-retarget";
import {
  collectVrmBones,
  resetVrmBones,
  applyVrmIdlePose,
  type VrmBones,
} from "@/lib/three/vrm-procedural";

/**
 * VRM + FBX figure (hybrid: FBX clips + procedural idle).
 *
 * - Loads a VRM model (humanoid rig + expressions) via drei useGLTF with the
 *   VRMLoaderPlugin registered.
 * - Loads a separate FBX animation file via drei useFBX.
 * - Retargets each FBX clip's rotation tracks onto the VRM's normalized
 *   humanoid bones (see three/vrm-retarget.ts).
 * - Plays the clip named by the active action (action.clip) on an
 *   AnimationMixer rooted at the VRM scene, then calls vrm.humanoid.update()
 *   so the normalized pose propagates to the rendered raw bones.
 * - When an action has `clip: null` (e.g. idle when the FBX has no idle clip),
 *   falls back to a procedural pose (see vrm-procedural.ts) instead of
 *   playing a clip — so idle is a calm breathing pose, not the dance clip.
 * - Lipsync via VRM expression "a".
 *
 * Registered for modelType="vrm-fbx". Contract: `modelPath` (the .vrm) and
 * `animationPath` (the .fbx) are both present. The manifest's `actions[]`
 * (built from FBX clip names) is also what the Python agent registers as
 * tools — so the kid's voice drives exactly the clips this body can play.
 */
export function VrmFbxFigure({ modelPath, animationPath, baseY, actions }: FigureProps) {
  // Cast sidesteps a three-stdlib / @types/three KTX2Loader type conflict;
  // runtime is unaffected. The VRM object lands on gltf.userData.vrm.
  const gltf = useGLTF(modelPath!, undefined, undefined, (loader) => {
    (loader.register as unknown as (p: unknown) => void)(
      (parser: unknown) => new VRMLoaderPlugin(parser as never),
    );
  }) as { scene: Group; userData: Record<string, unknown> };
  const scene = gltf.scene;

  // Load the FBX animation rig (we only need its clips).
  const fbx = useFBX(animationPath!) as Group & { animations: AnimationClip[] };

  const group = useRef<Group>(null);
  const vrmRef = useRef<VRM | null>(null);
  const bones = useRef<VrmBones>({});
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionByName = useRef<Map<string, AnimationAction>>(new Map());
  const currentName = useRef<string | null>(null);
  const mouthOpenRef = useRef(0);

  useEffect(() => {
    const vrm = gltf.userData.vrm as VRM | undefined;
    if (!vrm) return;
    vrmRef.current = vrm;
    VRMUtils.rotateVRM0(vrm);
    bones.current = collectVrmBones(vrm);

    scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [gltf, scene]);

  // Retarget FBX clips onto the VRM normalized rig, then build a mixer rooted
  // at the VRM scene (normalized bones live under vrm.scene).
  useEffect(() => {
    const vrm = vrmRef.current;
    if (!vrm || !fbx) return;

    const retargeted = retargetClipsToVrm(fbx.animations ?? [], vrm);

    const mixer = new AnimationMixer(vrm.scene);
    mixerRef.current = mixer;

    const map = new Map<string, AnimationAction>();
    for (const [name, clip] of retargeted) {
      map.set(name, mixer.clipAction(clip));
    }
    actionByName.current = map;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(vrm.scene);
      mixerRef.current = null;
    };
  }, [fbx, vrmRef]);

  // action.name -> clip name (string) from the manifest. Actions with no clip
  // (clip === null/undefined) are procedural and omitted from this map.
  const clipByAction = useMemo(() => {
    const list = actions ?? [];
    const map: Record<string, string> = {};
    for (const a of list) {
      if (a.clip) map[a.name] = a.clip;
      if (a.name.startsWith("walk") && a.clip) map.walk = a.clip;
    }
    return map;
  }, [actions]);

  useFrame((state, delta) => {
    const r = group.current;
    if (!r) return;
    const vrm = vrmRef.current;
    const mixer = mixerRef.current;
    const b = bones.current;

    mixer?.update(delta);
    vrm?.update(delta);

    const s = controller.getState();
    const t = (performance.now() - s.startedAt) / 1000;

    const cam = state.camera.position;
    const cameraFaceY = Math.atan2(cam.x - s.position.x, cam.z - s.position.z);
    const faceY = s.facing ?? cameraFaceY;
    r.position.set(s.position.x, baseY, s.position.z);
    r.rotation.set(0, faceY, 0);

    if (s.current === "walk" && s.walk) {
      const d = s.durationMs / 1000;
      const p = Math.min(t / d, 1);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      r.position.x = s.walk.from.x + (s.walk.to.x - s.walk.from.x) * eased;
      r.position.z = s.walk.from.z + (s.walk.to.z - s.walk.from.z) * eased;
    }

    // Lipsync via VRM 0.x vowel expression "a".
    const target = controller.getMouth();
    const mouthOpen = mouthOpenRef.current + (target - mouthOpenRef.current) * 0.25;
    mouthOpenRef.current = mouthOpen;
    const expressions = vrm?.expressionManager;
    if (expressions) {
      expressions.setValue("a", mouthOpen);
      expressions.setValue("u", mouthOpen * 0.5);
    }

    // Resolve the desired clip for the current action. No clip (null/undefined)
    // means procedural — used for idle when the FBX has no idle clip.
    const desiredClip = clipByAction[s.current];
    const wantProcedural = !desiredClip;

    if (wantProcedural) {
      // Stop any playing clip, then drive bones procedurally.
      if (currentName.current) {
        actionByName.current.get(currentName.current)?.fadeOut(0.2);
        currentName.current = null;
      }
      resetVrmBones(b);
      if (s.current === "idle" || s.current === "walk") {
        // Calm breathing pose for procedural idle. (Walk is only reachable
        // here if the character declared walk actions without a walk clip —
        // the manifest builder doesn't do that, so idle is the real path.)
        applyVrmIdlePose(b, t);
      }
      return;
    }

    // Crossfade to the desired clip; fall back to the first available clip
    // if the manifest's clip wasn't retargeted.
    const clipToPlay =
      desiredClip && actionByName.current.has(desiredClip)
        ? desiredClip
        : (actionByName.current.keys().next().value ?? "");
    if (clipToPlay && currentName.current !== clipToPlay) {
      const next = actionByName.current.get(clipToPlay);
      const prev = currentName.current
        ? actionByName.current.get(currentName.current)
        : null;
      prev?.fadeOut(0.2);
      if (next) {
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
      }
      currentName.current = clipToPlay;
    }
  });

  return (
    <group ref={group} position={[0, baseY, 0]}>
      <primitive object={scene} />
    </group>
  );
}

registerFigure("vrm-fbx", VrmFbxFigure);
