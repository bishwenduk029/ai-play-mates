// GLB/VRM parsing + manifest building helpers shared by the inspect + create
// endpoints. Pure functions, no Next.js deps — easy to test.
//
// Both .glb and .vrm are glTF binary containers. GLB files have baked
// animation clips; VRM files have a humanoid skeleton + blendshapes but
// typically zero clips (motion is procedural). This module detects which
// kind the file is and produces an appropriate action set for each.

import { readFile } from "node:fs/promises";

export type ModelType = "glb" | "vrm";

export interface DiscoveredClip {
  /** Exact clip name inside the GLB (null for VRM procedural actions). */
  clip: string | null;
  /** Suggested tool name (camelCase). */
  suggestedName: string;
  /** Suggested action label. */
  label: string;
  /** Auto-detected role. */
  role: "idle" | "walk" | "action";
  /** Suggested description. */
  description: string;
}

export interface InspectResult {
  modelType: ModelType;
  isVrm: boolean;
  clips: DiscoveredClip[];
  hasIdle: boolean;
  hasWalk: boolean;
  /** For VRM: blendshape presets available (a/e/i/o/u/blink...). */
  blendshapes: string[];
}

export interface ManifestAction {
  name: string;
  label: string;
  description: string;
  durationMs: number | null;
  /** Clip name for GLB; null for VRM procedural actions. */
  clip: string | null;
}

export interface ManifestDoc {
  id: string;
  label: string;
  description: string;
  modelType: ModelType;
  modelPath: string;
  baseY: number;
  actions: ManifestAction[];
}

interface GltfJson {
  animations?: { name?: string }[];
  extensions?: { VRM?: { blendShapeMaster?: { blendShapeGroups?: { presetName?: string; name?: string }[] } } };
  extensionsUsed?: string[];
}

/** Default walk actions shared by all model types. */
const WALK_ACTIONS: Array<[string, string, string]> = [
  ["walkForward", "▲", "Walk one step toward the kid."],
  ["walkBack", "▼", "Walk one step away from the kid."],
  ["walkLeft", "◀", "Walk one step to the kid's left."],
  ["walkRight", "▶", "Walk one step to the kid's right."],
];

/**
 * Parse a GLB/VRM file and return animation clip names + VRM metadata.
 */
export async function parseModel(glbPath: string): Promise<{
  clips: string[];
  isVrm: boolean;
  blendshapes: string[];
}> {
  const buf = await readFile(glbPath);
  const magic = buf.toString("ascii", 0, 4);
  if (magic !== "glTF") {
    throw new Error("not a valid GLB/VRM file (bad magic)");
  }

  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.toString("ascii", 16, 20);
  if (chunkType !== "JSON") {
    throw new Error("first chunk is not JSON");
  }

  const jsonStr = buf.toString("utf8", 20, 20 + chunkLen).replace(/\0+$/, "");
  const gltf = JSON.parse(jsonStr) as GltfJson;

  const isVrm =
    !!gltf.extensions?.VRM || gltf.extensionsUsed?.includes("VRM") === true;

  const animations = gltf.animations ?? [];
  const clipNames = animations.map((a, i) => a.name?.trim() || `clip_${i}`);
  const uniqueClips = [...new Set(clipNames)];

  const blendshapes: string[] =
    gltf.extensions?.VRM?.blendShapeMaster?.blendShapeGroups?.map(
      (g) => g.presetName ?? g.name ?? "unknown",
    ) ?? [];

  return { clips: uniqueClips, isVrm, blendshapes };
}

/**
 * Inspect a GLB/VRM and produce a structured preview with suggested roles.
 *
 * For GLB: returns one entry per discovered clip.
 * For VRM with zero clips: returns procedural idle + walk entries (the
 * VrmFigure component drives these via bone rotation).
 */
export async function inspectModel(glbPath: string): Promise<InspectResult> {
  const { clips, isVrm, blendshapes } = await parseModel(glbPath);

  // VRM with no clips — procedural locomotion only.
  if (isVrm && clips.length === 0) {
    return {
      modelType: "vrm",
      isVrm: true,
      hasIdle: true,
      hasWalk: true,
      blendshapes,
      clips: [
        {
          clip: null,
          suggestedName: "idle",
          label: "Idle",
          role: "idle",
          description: "Calm resting pose with gentle breathing (procedural).",
        },
        {
          clip: null,
          suggestedName: "walkForward",
          label: "Walk",
          role: "walk",
          description: "Walk locomotion (procedural bone control).",
        },
      ],
    };
  }

  // GLB (or VRM with clips) — one entry per clip.
  const idleClip = clips.find((c) => /idle|rest/i.test(c)) ?? null;
  const walkClip =
    clips.find((c) => /^walk\b/i.test(c) && !/rm/i.test(c)) ?? null;

  const discovered: DiscoveredClip[] = clips.map((clip) => {
    const role: DiscoveredClip["role"] =
      clip === idleClip ? "idle" : clip === walkClip ? "walk" : "action";
    const suggestedName =
      role === "idle"
        ? "idle"
        : role === "walk"
          ? "walkForward"
          : clipToToolName(clip);
    return {
      clip,
      suggestedName,
      label: clip,
      role,
      description:
        role === "idle"
          ? "Calm resting pose."
          : role === "walk"
            ? "Walk locomotion clip (auto-expanded to 4 directions)."
            : `Play the "${clip}" animation.`,
    };
  });

  return {
    modelType: isVrm ? "vrm" : "glb",
    isVrm,
    clips: discovered,
    hasIdle: idleClip !== null,
    hasWalk: walkClip !== null,
    blendshapes,
  };
}

/**
 * Build a manifest from a curated list of selected clips.
 *
 * For VRM procedural actions (clip === null): idle + walk are always included.
 * For GLB: selectedClips are exact clip names; walk is auto-expanded to 4 dirs.
 */
export function buildManifest(opts: {
  id: string;
  label: string;
  description: string;
  baseY: number;
  modelType: ModelType;
  selectedClips: Array<string | null>;
  allClips: Array<string | null>;
}): ManifestDoc {
  const { id, label, description, baseY, modelType, selectedClips, allClips } = opts;

  const actions: ManifestAction[] = [];

  // VRM procedural: clip === null entries are idle + walk.
  if (modelType === "vrm") {
    if (selectedClips.includes(null)) {
      actions.push({
        name: "idle",
        label: "Idle",
        description: "Calm resting pose (procedural).",
        durationMs: null,
        clip: null,
      });
    }
    if (selectedClips.includes(null)) {
      for (const [name, lbl, desc] of WALK_ACTIONS) {
        actions.push({ name, label: lbl, description: desc, durationMs: 1200, clip: null });
      }
    }
    return {
      id,
      label,
      description,
      modelType: "vrm",
      modelPath: `/characters/${id}/model.vrm`,
      baseY,
      actions,
    };
  }

  // GLB: selectedClips are exact clip name strings.
  const stringClips = selectedClips.filter((c): c is string => c !== null);
  const allStringClips = allClips.filter((c): c is string => c !== null);

  const idleClip = stringClips.find((c) => /idle|rest/i.test(c));
  const walkClip = stringClips.find((c) => /^walk\b/i.test(c) && !/rm/i.test(c));

  if (idleClip) {
    actions.push({
      name: "idle",
      label: "Idle",
      description: "Calm resting pose.",
      durationMs: null,
      clip: idleClip,
    });
  }

  for (const clip of stringClips) {
    if (clip === idleClip) continue;
    if (clip === walkClip) continue;
    actions.push({
      name: clipToToolName(clip),
      label: clip,
      description: `Play the "${clip}" animation.`,
      durationMs: null,
      clip,
    });
  }

  if (walkClip) {
    for (const [name, lbl, desc] of WALK_ACTIONS) {
      actions.push({ name, label: lbl, description: desc, durationMs: 1200, clip: walkClip });
    }
  }

  if (!idleClip && allStringClips.length > 0 && stringClips.length > 0) {
    actions.unshift({
      name: "idle",
      label: "Idle",
      description: "Default resting pose.",
      durationMs: null,
      clip: stringClips[0],
    });
  }

  return {
    id,
    label,
    description,
    modelType: "glb",
    modelPath: `/characters/${id}/model.glb`,
    baseY,
    actions,
  };
}

/** Convert a clip name like "Tail Attack" to a tool name like "tailAttack". */
function clipToToolName(clip: string): string {
  const words = clip.trim().split(/[\s_-]+/);
  const first = words[0].toLowerCase();
  const rest = words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return first + rest.join("");
}
