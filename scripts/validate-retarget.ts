// Validate VRM+FBX retargeting against a real Mixamo FBX + the avatar VRM.
// Run: node --experimental-strip-types scripts/validate-retarget.ts
//
// Prints: FBX clip names, bone-name coverage vs MIXAMO_TO_VRM, and how many
// quaternion tracks survive retargeting onto the VRM normalized rig.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { MIXAMO_TO_VRM, retargetClipsToVrm, normalizeBoneName } from "../src/lib/three/vrm-retarget.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const vrmPath = path.join(root, "public/characters/avatar/model.vrm");
const fbxPath = process.argv[2] ?? "/tmp/spac-test/samba.fbx";

// --- Load FBX (synchronous parse) ---
const fbxBuf = readFileSync(fbxPath);
const fbxAb = fbxBuf.buffer.slice(fbxBuf.byteOffset, fbxBuf.byteOffset + fbxBuf.byteLength);
const fbx = new FBXLoader().parse(fbxAb, "");
console.log("FBX clips:", fbx.animations.map((a) => a.name));

const fbxBones = new Set<string>();
for (const clip of fbx.animations) {
  for (const track of clip.tracks) {
    const dot = track.name.indexOf(".");
    if (dot > 0) fbxBones.add(track.name.slice(0, dot));
  }
}
const mapped = [...fbxBones].filter((b) => MIXAMO_TO_VRM[normalizeBoneName(b)]);
console.log(`FBX bones: ${fbxBones.size} | mapped to VRM: ${mapped.length}`);
const unmapped = [...fbxBones].filter(
  (b) => !MIXAMO_TO_VRM[normalizeBoneName(b)],
);
if (unmapped.length) console.log("unmapped bones:", unmapped.slice(0, 8), unmapped.length > 8 ? `…(+${unmapped.length-8})` : "");

// --- Load VRM (parse from buffer — Node has no fetch for file paths) ---
// GLTFLoader's texture path references `self`; polyfill it for Node.
(globalThis as unknown as { self: unknown }).self = globalThis;
const vrmBuf = readFileSync(vrmPath);
const vrmAb = vrmBuf.buffer.slice(vrmBuf.byteOffset, vrmBuf.byteOffset + vrmBuf.byteLength);
const gltf = (await new Promise((resolve, reject) =>
  new GLTFLoader()
    .register((parser) => new VRMLoaderPlugin(parser))
    .parse(vrmAb, "", resolve, reject),
)) as { userData: Record<string, unknown> };
const vrm = gltf.userData.vrm as { scene: { getObjectByName: (n: string) => unknown }; humanoid: { getNormalizedBoneNode: (n: string) => { name: string } | null } };
if (!vrm) throw new Error("no VRM in avatar");

// --- Retarget ---
const retargeted = retargetClipsToVrm(fbx.animations, vrm);
console.log("retargeted clips:");
for (const [name, clip] of retargeted) {
  console.log(`  ${name}: ${clip.tracks.length} tracks (dur ${clip.duration.toFixed(2)}s)`);
}

// Sanity: a retargeted track node name must resolve inside vrm.scene.
const root3 = vrm.scene;
let resolved = 0;
for (const clip of retargeted.values()) {
  for (const track of clip.tracks) {
    const nodeName = track.name.slice(0, track.name.indexOf("."));
    if (root3.getObjectByName(nodeName)) resolved++;
  }
}
console.log(`retargeted tracks resolvable in vrm.scene: ${resolved}`);
