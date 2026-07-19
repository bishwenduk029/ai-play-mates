"use client";

import { controller } from "@/lib/actions";
import { useActionState } from "@/lib/useActionState";
import { BunnyFigure } from "./BunnyFigure";
import { CreatureFigure } from "./CreatureFigure";

/**
 * Renders the active character body from its manifest.
 * modelType:
 *   glb       -> CreatureFigure (rigged clips)
 *   primitive -> BunnyFigure (procedural primitives)
 *
 * VRM support lives on the `advanced-figures` branch.
 */
export function Figure() {
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
    case "primitive":
      return <BunnyFigure key={character.id} baseY={character.baseY} />;
    default:
      return null;
  }
}
