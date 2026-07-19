// Client-side GLB/VRM clip discovery — reads a File/ArrayBuffer and extracts
// animation clip names + VRM detection from the glTF JSON chunk. No server
// round-trip needed for the preview UX.

export type ModelType = "glb" | "vrm";

export interface BrowserClip {
  clip: string | null;
  suggestedName: string;
  role: "idle" | "walk" | "action";
  description: string;
}

export interface BrowserInspectResult {
  modelType: ModelType;
  isVrm: boolean;
  clips: BrowserClip[];
  blendshapes: string[];
}

interface GltfJson {
  animations?: { name?: string }[];
  extensions?: { VRM?: { blendShapeMaster?: { blendShapeGroups?: { presetName?: string; name?: string }[] } } };
  extensionsUsed?: string[];
}

export async function inspectModelBrowser(
  file: File | ArrayBuffer,
): Promise<BrowserInspectResult> {
  const buf = file instanceof File ? await file.arrayBuffer() : file;
  const view = new DataView(buf);

  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4));
  if (magic !== "glTF") {
    throw new Error("Not a valid GLB/VRM file");
  }

  const chunkLen = view.getUint32(12, true);
  const chunkType = new TextDecoder().decode(new Uint8Array(buf, 16, 4));
  if (chunkType !== "JSON") {
    throw new Error("First chunk is not JSON");
  }

  const jsonStr = new TextDecoder().decode(
    new Uint8Array(buf, 20, chunkLen),
  ).replace(/\0+$/, "");
  const gltf = JSON.parse(jsonStr) as GltfJson;

  const isVrm =
    !!gltf.extensions?.VRM || gltf.extensionsUsed?.includes("VRM") === true;

  const names = (gltf.animations ?? []).map(
    (a, i) => (a.name?.trim() || `clip_${i}`),
  );
  const clips = [...new Set(names)];

  const blendshapes: string[] =
    gltf.extensions?.VRM?.blendShapeMaster?.blendShapeGroups?.map(
      (g) => g.presetName ?? g.name ?? "unknown",
    ) ?? [];

  // VRM with no clips — procedural idle + walk.
  if (isVrm && clips.length === 0) {
    return {
      modelType: "vrm",
      isVrm: true,
      blendshapes,
      clips: [
        { clip: null, suggestedName: "idle", role: "idle", description: "Procedural idle (breathing)." },
        { clip: null, suggestedName: "walkForward", role: "walk", description: "Procedural walk locomotion." },
      ],
    };
  }

  // GLB (or VRM with clips) — one entry per clip.
  const idleClip = clips.find((c) => /idle|rest/i.test(c)) ?? null;
  const walkClip = clips.find((c) => /^walk\b/i.test(c) && !/rm/i.test(c)) ?? null;

  return {
    modelType: isVrm ? "vrm" : "glb",
    isVrm,
    blendshapes,
    clips: clips.map((clip) => {
      const role: BrowserClip["role"] =
        clip === idleClip ? "idle" : clip === walkClip ? "walk" : "action";
      return {
        clip,
        suggestedName: role === "idle" ? "idle" : role === "walk" ? "walkForward" : clipToToolName(clip),
        role,
        description: role === "idle" ? "Calm resting pose." : role === "walk" ? "Walk (auto-expanded to 4 dirs)." : `Play "${clip}".`,
      };
    }),
  };
}

function clipToToolName(clip: string): string {
  const words = clip.trim().split(/[\s_.-]+/).filter(Boolean);
  const first = words[0].toLowerCase();
  const rest = words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return first + rest.join("");
}
