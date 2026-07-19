"use client";

import { controller } from "@/lib/actions";
import { useActionState } from "@/lib/useActionState";
import { BunnyFigure } from "./BunnyFigure";
import { CreatureFigure } from "./CreatureFigure";
import { VrmFigure } from "./VrmFigure";

/**
 * Renders the active character body from its manifest.
 * modelType:
 *   glb       -> CreatureFigure (rigged clips)
 *   vrm       -> VrmFigure (procedural locomotion + facial lipsync)
 *   primitive -> BunnyFigure (procedural primitives)
 */
export function Figure() {
  // Re-render on controller changes so character swaps update the scene.
  useActionState();
  const character = controller.getCharacter();
  if (!character) return null;

  switch (character.modelType) {
    case "glb":
      return (
        <CreatureFigure
          key={character.id}
          modelPath={character.modelPath!}
          baseY={character.baseY}
          actions={character.actions}
        />
      );
    case "vrm":
      return (
        <VrmFigure
          key={character.id}
          modelPath={character.modelPath!}
          baseY={character.baseY}
        />
      );
    case "primitive":
      return <BunnyFigure key={character.id} baseY={character.baseY} />;
    default:
      return null;
  }
}
