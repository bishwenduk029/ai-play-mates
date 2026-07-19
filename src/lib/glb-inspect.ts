// GLB parsing + manifest building helpers shared by the inspect + create
// endpoints. Pure functions, no Next.js deps — easy to test.

import { readFile } from "node:fs/promises";

export interface DiscoveredClip {
  clip: string;
  suggestedName: string;
  label: string;
  role: "idle" | "walk" | "action";
  description: string;
}

export interface InspectResult {
  clips: DiscoveredClip[];
  hasIdle: boolean;
  hasWalk: boolean;
}

export interface ManifestAction {
  name: string;
  label: string;
  description: string;
  durationMs: number | null;
  clip: string;
}

export interface ManifestDoc {
  id: string;
  label: string;
  description: string;
  modelType: "glb";
  modelPath: string;
  baseY: number;
  actions: ManifestAction[];
}

interface GltfJson {
  animations?: { name?: string }[];
}

const WALK_ACTIONS: Array<[string, string, string]> = [
  ["walkForward", "▲", "Walk one step toward the kid."],
  ["walkBack", "▼", "Walk one step away from the kid."],
  ["walkLeft", "◀", "Walk one step to the kid's left."],
  ["walkRight", "▶", "Walk one step to the kid's right."],
];

/** Parse a GLB file and return animation clip names in order. */
export async function parseGlbClips(glbPath: string): Promise<string[]> {
  const buf = await readFile(glbPath);
  const magic = buf.toString("ascii", 0, 4);
  if (magic !== "glTF") {
    throw new Error("not a valid GLB file (bad magic)");
  }
  const chunkLen = buf.readUInt32LE(12);
  const chunkType = buf.toString("ascii", 16, 20);
  if (chunkType !== "JSON") {
    throw new Error("first chunk is not JSON");
  }
  const jsonStr = buf.toString("utf8", 20, 20 + chunkLen).replace(/\0+$/, "");
  const gltf = JSON.parse(jsonStr) as GltfJson;
  const names = (gltf.animations ?? []).map((a, i) => a.name?.trim() || `clip_${i}`);
  return [...new Set(names)];
}

/** Inspect a GLB's clips and produce a structured preview with suggested roles. */
export async function inspectGlb(glbPath: string): Promise<InspectResult> {
  const clipNames = await parseGlbClips(glbPath);
  const idleClip = clipNames.find((c) => /idle|rest/i.test(c)) ?? null;
  const walkClip = clipNames.find((c) => /^walk\b/i.test(c) && !/rm/i.test(c)) ?? null;

  const clips: DiscoveredClip[] = clipNames.map((clip) => {
    const role: DiscoveredClip["role"] =
      clip === idleClip ? "idle" : clip === walkClip ? "walk" : "action";
    return {
      clip,
      suggestedName: role === "idle" ? "idle" : role === "walk" ? "walkForward" : clipToToolName(clip),
      label: clip,
      role,
      description: role === "idle" ? "Calm resting pose." : role === "walk" ? "Walk locomotion (4 directions)." : `Play "${clip}".`,
    };
  });

  return { clips, hasIdle: idleClip !== null, hasWalk: walkClip !== null };
}

/** Build a manifest from selected clips. Walk/idle auto-expanded. */
export function buildManifest(opts: {
  id: string;
  label: string;
  description: string;
  baseY: number;
  selectedClips: string[];
  allClips: string[];
}): ManifestDoc {
  const { id, label, description, baseY, selectedClips, allClips } = opts;
  const actions: ManifestAction[] = [];

  const idleClip = selectedClips.find((c) => /idle|rest/i.test(c));
  const walkClip = selectedClips.find((c) => /^walk\b/i.test(c) && !/rm/i.test(c));

  if (idleClip) {
    actions.push({ name: "idle", label: "Idle", description: "Calm resting pose.", durationMs: null, clip: idleClip });
  }

  for (const clip of selectedClips) {
    if (clip === idleClip || clip === walkClip) continue;
    actions.push({ name: clipToToolName(clip), label: clip, description: `Play "${clip}".`, durationMs: null, clip });
  }

  if (walkClip) {
    for (const [name, lbl, desc] of WALK_ACTIONS) {
      actions.push({ name, label: lbl, description: desc, durationMs: 1200, clip: walkClip });
    }
  }

  if (!idleClip && allClips.length > 0 && selectedClips.length > 0) {
    actions.unshift({ name: "idle", label: "Idle", description: "Default resting pose.", durationMs: null, clip: selectedClips[0] });
  }

  return { id, label, description, modelType: "glb", modelPath: `/characters/${id}/model.glb`, baseY, actions };
}

function clipToToolName(clip: string): string {
  const words = clip.trim().split(/[\s_-]+/);
  const first = words[0].toLowerCase();
  const rest = words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return first + rest.join("");
}
