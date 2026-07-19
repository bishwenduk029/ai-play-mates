"use client";

import { createElement } from "react";
import { controller } from "@/lib/actions";
import { useActionState } from "@/lib/useActionState";
import { getFigureRenderer } from "@/lib/figure-registry";

// Self-registration: importing each renderer module registers it in the
// Strategy registry for its modelType (Open/Closed — add a renderer, import
// it here, nothing else changes).
import "./BunnyFigure";
import "./CreatureFigure";
import "./VrmFigure";
import "./VrmFbxFigure";

/**
 * Renders the active character body from its manifest, dispatched by
 * modelType through the figure registry. The manifest's `actions[]` is the
 * single source of truth — it also drives the Python agent's tool set
 * (see agent/agent.py), so a character's action vocabulary is identical on
 * both ends.
 *
 * createElement is used instead of JSX (<Renderer/>) because the component
 * type is resolved at runtime from the registry; the React 19
 * static-components lint rule flags JSX whose tag is a runtime value, but a
 * registry lookup returning a stable, module-level component is a legitimate
 * Strategy dispatch (not a component created during render).
 */
export function Figure() {
  useActionState();
  const character = controller.getCharacter();
  if (!character) return null;

  const Renderer = getFigureRenderer(character.modelType);
  if (!Renderer) {
    return null;
  }

  return createElement(
    Renderer,
    {
      key: character.id,
      modelPath: character.modelPath ?? undefined,
      animationPath: character.animationPath ?? undefined,
      baseY: character.baseY,
      actions: character.actions,
    },
  );
}
