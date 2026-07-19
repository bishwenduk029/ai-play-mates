// Model loaders — Factory pattern (GoF).
//
// One promisified entry point per supported runtime format. The figure
// components mostly use drei hooks (useGLTF / useLoader) for suspense; this
// module is the reusable factory for code paths that load imperatively (e.g.
// client-side FBX clip discovery in the uploader, server-free inspection).
//
// Importing three's example loaders is safe in a client bundle; these are
// never evaluated on the server.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { VRMLoaderPlugin, type VRM } from "@pixiv/three-vrm";

export interface LoadedGltf {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  userData: Record<string, unknown>;
}

export interface LoadedVrm {
  scene: THREE.Group;
  vrm: VRM;
  animations: THREE.AnimationClip[];
}

/** Load a self-contained GLB (rigged model + baked clips). */
export function loadGlb(url: string): Promise<LoadedGltf> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });
}

/** Load a VRM file (humanoid rig + expressions, usually zero clips). */
export function loadVrm(url: string): Promise<LoadedVrm> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      url,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          reject(new Error("VRM file loaded but no VRM extension was found"));
          return;
        }
        resolve({
          scene: gltf.scene,
          vrm,
          animations: gltf.animations,
        });
      },
      undefined,
      reject,
    );
  });
}

/** Load an FBX animation file (returns a throwaway rig + its clips). */
export function loadFbx(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    new FBXLoader().load(url, resolve, undefined, reject);
  });
}

/**
 * Parse an FBX from an in-memory buffer (no network). Used by the uploader
 * to discover animation clip names without a server round-trip.
 * FBXLoader.parse is synchronous; textures are ignored (we only need clips).
 */
export function parseFbx(buffer: ArrayBuffer): THREE.Group {
  return new FBXLoader().parse(buffer, "");
}
