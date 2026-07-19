"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import type { Group, AnimationAction, AnimationClip } from "three";
import { controller } from "@/lib/actions";
import type { CharacterAction } from "@/lib/characters";

interface Props {
  modelPath: string;
  baseY: number;
  actions: CharacterAction[];
}

/**
 * Generic fully-rigged GLB figure. Clip names come from the character
 * manifesto (action.clip). Adding a new GLB character does not require
 * changes here — just ship model.glb + manifest.json.
 */
export function CreatureFigure({ modelPath, baseY, actions: actionList }: Props) {
  const group = useRef<Group>(null);
  const { scene, animations } = useGLTF(modelPath) as {
    scene: Group;
    animations: AnimationClip[];
  };
  const { actions } = useAnimations(animations, group);
  const currentClip = useRef<string | null>(null);

  // action name -> clip name (from the manifest)
  const clipByAction = useRef<Record<string, string>>({});
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const a of actionList) {
      if (a.clip) map[a.name] = a.clip;
      // Walk directions all share the same walk clip.
      if (a.name.startsWith("walk") && a.clip) map.walk = a.clip;
    }
    // idle regularly falls back to Idle / first clip
    if (!map.idle) map.idle = actionList.find((a) => a.name === "idle")?.clip ?? "Idle";
    clipByAction.current = map;
  }, [actionList]);

  useEffect(() => {
    scene.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [scene]);

  useFrame((state) => {
    const r = group.current;
    if (!r) return;

    const s = controller.getState();
    const t = (performance.now() - s.startedAt) / 1000;

    // Look up clip each frame from the live actions map (GLB load is async).
    const clips = new Map<string, AnimationAction>();
    for (const [name, action] of Object.entries(actions)) {
      if (action) clips.set(name, action);
    }

    const desiredClip =
      clipByAction.current[s.current] ??
      clipByAction.current.idle ??
      "Idle";

    if (currentClip.current !== desiredClip) {
      const next = clips.get(desiredClip);
      const prev = currentClip.current ? clips.get(currentClip.current) : null;
      prev?.fadeOut(0.2);
      if (next) {
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
      }
      currentClip.current = desiredClip;
    }

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
  });

  return (
    <group ref={group} position={[0, baseY, 0]}>
      <primitive object={scene} />
    </group>
  );
}
