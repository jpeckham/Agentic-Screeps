export interface DiagnosticConfig {
  capacityDeficitToleranceTicks: number;
  sourceBackpressureThreshold: number;
  sourceBackpressureDurationTicks: number;
  criticalReplacementRequestToleranceTicks: number;
  criticalReplacementSpawnToleranceTicks: number;
  recoveryStabilityTicks: number;
  scenarioMaximumTicks: number;
}

export const DEFAULT_DIAGNOSTIC_CONFIG: DiagnosticConfig = {
  capacityDeficitToleranceTicks: 10,
  sourceBackpressureThreshold: 0.8,
  sourceBackpressureDurationTicks: 10,
  criticalReplacementRequestToleranceTicks: 10,
  criticalReplacementSpawnToleranceTicks: 15,
  recoveryStabilityTicks: 20,
  scenarioMaximumTicks: 320
};

export function mergeDiagnosticConfig(overrides: Partial<DiagnosticConfig> = {}): DiagnosticConfig {
  return { ...DEFAULT_DIAGNOSTIC_CONFIG, ...overrides };
}
