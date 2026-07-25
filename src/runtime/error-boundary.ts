import {
  formatError,
  pushError,
  type ReleaseState
} from "./release-state.js";

export function runSafely(
  state: ReleaseState,
  subsystem: string,
  operation: () => void,
  options: { tick: number; maxHistory?: number }
): void {
  try {
    operation();
  } catch (error) {
    const priorFailures = state.errors.filter(
      (record) => record.subsystem === subsystem
    ).length;
    pushError(
      state,
      {
        version: state.version,
        tick: options.tick,
        subsystem,
        ...formatError(error),
        consecutiveFailureCount: priorFailures + 1,
        lastSuccessfulTick: state.lastHealthyTick
      },
      options.maxHistory ?? 20
    );
  }
}
