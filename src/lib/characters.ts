/**
 * Character registry — loads manifests from /characters/<id>/manifest.json.
 *
 * A character is pure data: model path + action set. That data drives the
 * frontend (which figure to render, which buttons to show) and the LiveKit
 * agent (which tools to register). Adding a character later = drop a GLB into
 * public/characters/<id>/ + write a manifest. No code changes required for
 * the generic glb path.
 */

export type ModelType = "glb" | "vrm" | "primitive";

export interface CharacterAction {
  name: string;
  label: string;
  description: string;
  /** null = loops until another action is called. */
  durationMs: number | null;
  /** For modelType=glb: the animation clip name inside the GLB. */
  clip?: string;
}

export interface CharacterManifest {
  id: string;
  label: string;
  description: string;
  modelType: ModelType;
  /** Public URL path to the model file (filesystem today, CDN later). null for primitive. */
  modelPath: string | null;
  baseY: number;
  actions: CharacterAction[];
}

export interface CharacterIndex {
  characters: string[];
}

/** Infinite duration sentinel used by the controller. */
export function actionDuration(action: CharacterAction): number {
  return action.durationMs === null ? Infinity : action.durationMs;
}

export async function fetchCharacterIndex(): Promise<string[]> {
  const res = await fetch("/characters/index.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`characters index ${res.status}`);
  const data = (await res.json()) as CharacterIndex;
  return data.characters;
}

export async function fetchCharacter(id: string): Promise<CharacterManifest> {
  const res = await fetch(`/characters/${id}/manifest.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`character ${id} ${res.status}`);
  return (await res.json()) as CharacterManifest;
}

export async function fetchAllCharacters(): Promise<CharacterManifest[]> {
  const ids = await fetchCharacterIndex();
  return Promise.all(ids.map(fetchCharacter));
}
