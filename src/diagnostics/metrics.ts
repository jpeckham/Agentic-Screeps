import type { DiagnosticConfig } from "./config.js";
import type { DiagnosticTelemetry, MetricSample } from "./telemetry.js";

export interface DiagnosticRunMetrics {
  baselineHaulingCapacity: number;
  lowestHaulingCapacityAfterHaulerLoss: number;
  replacementRequestDelay: number;
  replacementSpawnDelay: number;
  totalReplacementGap: number;
  maximumSourceContainerFullness: number;
  ticksAbove80SourceContainerFullness: number;
  ticksAbove95SourceContainerFullness: number;
  blockedMinerHarvestTicks: number;
  energyDeliveredBeforeFailure: number;
  energyDeliveredDuringDegradation: number;
  energyDeliveredAfterRecovery: number;
  ticksUntilRecovery: number;
}

export function calculateDiagnosticMetrics(
  telemetry: DiagnosticTelemetry,
  config: DiagnosticConfig
): DiagnosticRunMetrics {
  void config;
  const lossTick = firstEventTick(telemetry, "hauler_lost") ?? firstTick(telemetry);
  const requestTick = firstEventTick(telemetry, "hauler_replacement_requested");
  const spawnStartedTick = firstEventTick(telemetry, "hauler_replacement_started");
  const spawnedTick = firstEventTick(telemetry, "hauler_replacement_spawned");
  const recoveryTick = firstEventTick(telemetry, "source_backpressure_ended") ?? spawnedTick;

  const activeCapacity = samples(telemetry, "logistics.activeHaulingCapacity");
  const fullness = samples(telemetry, "source.containerFullness");
  const blocked = samples(telemetry, "source.blockedHarvestTicks");
  const delivered = samples(telemetry, "logistics.energyDelivered");

  return {
    baselineHaulingCapacity: maxValue(activeCapacity.filter((sample) => sample.gameTick < lossTick)),
    lowestHaulingCapacityAfterHaulerLoss: minValue(activeCapacity.filter((sample) => sample.gameTick >= lossTick)),
    replacementRequestDelay: requestTick === undefined ? 0 : requestTick - lossTick,
    replacementSpawnDelay: requestTick === undefined || spawnStartedTick === undefined ? 0 : spawnStartedTick - requestTick,
    totalReplacementGap: spawnedTick === undefined ? 0 : spawnedTick - lossTick,
    maximumSourceContainerFullness: maxValue(fullness),
    ticksAbove80SourceContainerFullness: distinctTicks(fullness.filter((sample) => sample.value > 0.8)),
    ticksAbove95SourceContainerFullness: distinctTicks(fullness.filter((sample) => sample.value > 0.95)),
    blockedMinerHarvestTicks: sumValues(blocked),
    energyDeliveredBeforeFailure: sumValues(delivered.filter((sample) => sample.gameTick < lossTick)),
    energyDeliveredDuringDegradation: sumValues(
      delivered.filter((sample) => sample.gameTick >= lossTick && (recoveryTick === undefined || sample.gameTick < recoveryTick))
    ),
    energyDeliveredAfterRecovery: sumValues(
      delivered.filter((sample) => recoveryTick !== undefined && sample.gameTick >= recoveryTick)
    ),
    ticksUntilRecovery: recoveryTick === undefined ? 0 : recoveryTick - lossTick
  };
}

function samples(telemetry: DiagnosticTelemetry, metricName: string): MetricSample[] {
  return telemetry.metrics
    .filter((sample) => sample.metricName === metricName)
    .sort((left, right) => left.gameTick - right.gameTick);
}

function firstEventTick(telemetry: DiagnosticTelemetry, eventType: string): number | undefined {
  return telemetry.events
    .filter((event) => event.eventType === eventType)
    .sort((left, right) => left.gameTick - right.gameTick)[0]?.gameTick;
}

function firstTick(telemetry: DiagnosticTelemetry): number {
  return Math.min(...telemetry.metrics.map((sample) => sample.gameTick));
}

function maxValue(samplesToCheck: MetricSample[]): number {
  return samplesToCheck.length === 0 ? 0 : Math.max(...samplesToCheck.map((sample) => sample.value));
}

function minValue(samplesToCheck: MetricSample[]): number {
  return samplesToCheck.length === 0 ? 0 : Math.min(...samplesToCheck.map((sample) => sample.value));
}

function sumValues(samplesToCheck: MetricSample[]): number {
  return samplesToCheck.reduce((total, sample) => total + sample.value, 0);
}

function distinctTicks(samplesToCheck: MetricSample[]): number {
  return new Set(samplesToCheck.map((sample) => sample.gameTick)).size;
}
