import { BUILD_INFO } from "./build-info.js";

export interface RuntimeErrorRecord {
  version: string;
  tick: number;
  subsystem: string;
  message: string;
  stack?: string;
  consecutiveFailureCount: number;
  lastSuccessfulTick: number;
}

export interface ReleaseState {
  version: string;
  activatedAt: number;
  lastHealthyTick: number;
  healthyTicks: number;
  consecutiveTopLevelFailures: number;
  degradedMode: boolean;
  errors: RuntimeErrorRecord[];
}

export interface RootRuntimeMemory {
  runtime: ReleaseState;
}

export function createInitialReleaseState(
  version: string,
  tick: number
): ReleaseState {
  return {
    version,
    activatedAt: tick,
    lastHealthyTick: tick,
    healthyTicks: 0,
    consecutiveTopLevelFailures: 0,
    degradedMode: false,
    errors: []
  };
}

export function beginTick(
  state: ReleaseState,
  options: { version?: string; tick: number }
): void {
  const version = options.version ?? BUILD_INFO.releaseId;
  if (state.version !== version) {
    state.version = version;
    state.activatedAt = options.tick;
    state.lastHealthyTick = options.tick;
    state.healthyTicks = 0;
    state.consecutiveTopLevelFailures = 0;
    state.degradedMode = false;
    state.errors = [];
  }
}

export function recordHealthyTick(
  state: ReleaseState,
  options: { tick: number; recoverAfterHealthyTicks?: number }
): void {
  state.lastHealthyTick = options.tick;
  state.healthyTicks += 1;
  state.consecutiveTopLevelFailures = 0;
  if (
    state.degradedMode &&
    state.healthyTicks >= (options.recoverAfterHealthyTicks ?? 10)
  ) {
    state.degradedMode = false;
  }
}

export function recordTopLevelFailure(
  state: ReleaseState,
  options: { tick: number; error: unknown; threshold?: number; maxHistory?: number }
): void {
  state.healthyTicks = 0;
  state.consecutiveTopLevelFailures += 1;
  if (state.consecutiveTopLevelFailures >= (options.threshold ?? 3)) {
    state.degradedMode = true;
  }
  pushError(state, {
    version: state.version,
    tick: options.tick,
    subsystem: "top-level",
    ...formatError(options.error),
    consecutiveFailureCount: state.consecutiveTopLevelFailures,
    lastSuccessfulTick: state.lastHealthyTick
  }, options.maxHistory ?? 20);
}

export function endTick(): void {
}

export function pushError(
  state: ReleaseState,
  record: RuntimeErrorRecord,
  maxHistory: number
): void {
  state.errors.push(record);
  if (state.errors.length > maxHistory) {
    state.errors.splice(0, state.errors.length - maxHistory);
  }
}

export function formatError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      ...(error.stack ? { stack: error.stack.split("\n").slice(0, 4).join("\n") } : {})
    };
  }
  return { message: String(error) };
}
