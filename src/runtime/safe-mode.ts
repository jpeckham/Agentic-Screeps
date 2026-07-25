import type { ReleaseState } from "./release-state.js";

export function shouldRunDegradedMode(state: ReleaseState): boolean {
  return state.degradedMode;
}
