"use client";

import { useSyncExternalStore } from "react";
import { controller, type ActionState } from "./actions";

/** Subscribe a React component to the current action without re-rendering on
 *  every animation frame (the snapshot only changes when an action is
 *  triggered). */
export function useActionState(): ActionState {
  return useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.getState(),
    () => controller.getState(),
  );
}
