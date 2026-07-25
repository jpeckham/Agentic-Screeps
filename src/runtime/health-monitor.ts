import type { ReleaseState } from "./release-state.js";

export function summarizeReleaseHealth(state: ReleaseState): string {
  return `${state.version}: healthy=${state.healthyTicks} failures=${state.consecutiveTopLevelFailures} degraded=${state.degradedMode}`;
}
