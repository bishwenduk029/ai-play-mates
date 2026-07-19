// Client-side FBX clip discovery — reads a File/ArrayBuffer and extracts
// animation clip names via three's FBXLoader.parse (no server round-trip).
// Symmetric to glb-browser.ts for GLB/VRM.
//
// Textures referenced by the FBX are intentionally ignored; we only need the
// clip names for the uploader's selection checklist.

import * as THREE from "three";
import { parseFbx } from "./three/loaders";

export interface FbxBrowserInspectResult {
  /** Clip names discovered in the FBX (stable order, deduped). */
  clips: string[];
}

export async function inspectFbxBrowser(
  file: File | ArrayBuffer,
): Promise<FbxBrowserInspectResult> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  let group: THREE.Group;
  try {
    group = parseFbx(buffer);
  } catch (e) {
    throw new Error(
      e instanceof Error ? `Not a valid FBX file: ${e.message}` : "Not a valid FBX file",
    );
  }
  const names = (group.animations ?? [])
    .map((a) => a.name?.trim() || `clip_${Math.random().toString(36).slice(2, 7)}`);
  return { clips: [...new Set(names)] };
}
