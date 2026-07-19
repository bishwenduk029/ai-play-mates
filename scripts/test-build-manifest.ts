// Verify buildManifest output for all three model types.
// Run: node --experimental-strip-types scripts/test-build-manifest.ts
import { buildManifest } from "../src/lib/glb-inspect.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

// --- GLB ---
const glb = buildManifest({
  id: "creature", label: "Creature", description: "d", baseY: 0,
  modelType: "glb",
  selectedClips: ["Idle", "Attack", "Walk"],
  allClips: ["Idle", "Attack", "Walk", "Swim"],
});
assert(glb.modelType === "glb", "glb modelType");
assert(glb.modelPath === "/characters/creature/model.glb", "glb modelPath");
assert(!("animationPath" in glb) || glb.animationPath === undefined, "glb has no animationPath");
assert(glb.actions.some((a) => a.name === "idle" && a.clip === "Idle"), "glb idle action");
assert(glb.actions.some((a) => a.name === "attack" && a.clip === "Attack"), "glb attack action");
assert(glb.actions.filter((a) => a.name.startsWith("walk")).length === 4, "glb walk expanded to 4 dirs");

// --- VRM (procedural) ---
const vrm = buildManifest({
  id: "avatar", label: "Avatar", description: "d", baseY: 0,
  modelType: "vrm",
  selectedClips: [null],
  allClips: [null],
});
assert(vrm.modelType === "vrm", "vrm modelType");
assert(vrm.modelPath === "/characters/avatar/model.vrm", "vrm modelPath");
assert(!("animationPath" in vrm) || vrm.animationPath === undefined, "vrm has no animationPath");
assert(vrm.actions.some((a) => a.name === "idle" && a.clip === null), "vrm procedural idle");
assert(vrm.actions.filter((a) => a.name.startsWith("walk")).length === 4, "vrm walk expanded to 4 dirs");

// --- VRM + FBX ---
const vrmFbx = buildManifest({
  id: "samba", label: "Samba", description: "d", baseY: 0,
  modelType: "vrm-fbx",
  selectedClips: ["mixamo.com"],
  allClips: ["mixamo.com"],
});
assert(vrmFbx.modelType === "vrm-fbx", "vrm-fbx modelType");
assert(vrmFbx.modelPath === "/characters/samba/model.vrm", "vrm-fbx modelPath");
assert(vrmFbx.animationPath === "/characters/samba/animations.fbx", "vrm-fbx animationPath");
assert(vrmFbx.actions.some((a) => a.name === "idle" && a.clip === null), "vrm-fbx procedural idle (clip null)");
assert(vrmFbx.actions.some((a) => a.name === "mixamoCom" && a.clip === "mixamo.com"), "vrm-fbx clip -> tool name");

// Every action has name + description (the agent reads these two fields).
for (const m of [glb, vrm, vrmFbx]) {
  for (const a of m.actions) {
    assert(typeof a.name === "string" && a.name.length > 0, `${m.id} action has name`);
    assert(typeof a.description === "string" && a.description.length > 0, `${m.id} action "${a.name}" has description`);
  }
}

console.log("\nAll manifest assertions passed.");
