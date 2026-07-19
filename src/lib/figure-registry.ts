// Figure renderer registry — Strategy pattern (GoF).
//
// Each model type has a concrete renderer component implementing the same
// FigureProps interface. Adding a new model type = register a new component
// in the REGISTRY map. No switch statements, no edits to existing code
// (Open/Closed Principle).
//
// The registry is the seam; the renderers are the adapters. The controller
// is the deep module behind all of them.

import type { FC } from "react";
import type { CharacterAction } from "./characters";

export type ModelType = "glb" | "vrm" | "vrm-fbx" | "primitive";

/** Common interface all figure renderers implement. */
export interface FigureProps {
  /** Public URL to the model file (GLB, VRM, or FBX). */
  modelPath: string;
  /** Root Y position so feet rest on the ground. */
  baseY: number;
  /** Action set from the character manifest. */
  actions: CharacterAction[];
  /** For vrm-fbx: the FBX animation file to retarget onto the VRM rig. */
  animationPath?: string;
}

/** Registry: modelType → renderer component. Extend, don't modify. */
const REGISTRY: Partial<Record<ModelType, FC<FigureProps>>> = {};

/** Register a renderer for a model type. Called at module load. */
export function registerFigure(type: ModelType, component: FC<FigureProps>): void {
  REGISTRY[type] = component;
}

/** Look up the renderer for a model type. Returns null if unregistered. */
export function getFigureRenderer(type: ModelType): FC<FigureProps> | null {
  return REGISTRY[type] ?? null;
}
