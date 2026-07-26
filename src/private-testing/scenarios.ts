import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ScenarioAssertion } from "./assertions.js";

export interface CombatScenario {
  name: string;
  description: string;
  initialState: {
    baseline: "owned-colony";
  };
  durationTicks: number;
  hostileCreeps: HostileCreepFixture[];
  assertions: ScenarioAssertion[];
}

export interface HostileCreepFixture {
  name: string;
  body: BodyPartName[];
  roomName: string;
  x: number;
  y: number;
  hits?: number;
  action?: "hold" | "approachSpawn" | "attackSpawn";
}

export type BodyPartName =
  | "move"
  | "work"
  | "carry"
  | "attack"
  | "ranged_attack"
  | "heal"
  | "tough"
  | "claim";

const BODY_PARTS = new Set<BodyPartName>([
  "move",
  "work",
  "carry",
  "attack",
  "ranged_attack",
  "heal",
  "tough",
  "claim"
]);

const HOSTILE_ACTIONS = new Set(["hold", "approachSpawn", "attackSpawn"]);
const ASSERTION_TYPES = new Set([
  "equals",
  "oneOf",
  "everEquals",
  "everOneOf",
  "becomesTrueWithin",
  "remainsUnchanged",
  "exists",
  "notExists",
  "hitPointsDecreased",
  "postureTransition",
  "noRuntimeException"
]);

export async function loadScenarioDefinitions(directory: string): Promise<CombatScenario[]> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right));
  const scenarios = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(join(directory, file), "utf8")) as unknown;
    scenarios.push(validateScenarioDefinition(parsed));
  }
  return scenarios.sort((left, right) => left.name.localeCompare(right.name));
}

export function validateScenarioDefinition(value: unknown): CombatScenario {
  const errors: string[] = [];
  if (!isRecord(value)) throw new Error("Scenario definition must be an object.");

  if (!isNonEmptyString(value.name)) errors.push("name must be a non-empty string");
  if (!isNonEmptyString(value.description)) errors.push("description must be a non-empty string");
  if (!isRecord(value.initialState) || value.initialState.baseline !== "owned-colony") {
    errors.push("initialState.baseline must be owned-colony");
  }
  if (!isPositiveInteger(value.durationTicks)) {
    errors.push("durationTicks must be a positive integer");
  }
  if (!Array.isArray(value.hostileCreeps)) {
    errors.push("hostileCreeps must be an array");
  } else {
    value.hostileCreeps.forEach((hostile, index) => {
      validateHostile(hostile, index, errors);
    });
  }
  if (!Array.isArray(value.assertions) || value.assertions.length === 0) {
    errors.push("assertions must be a non-empty array");
  } else {
    value.assertions.forEach((assertion, index) => validateAssertion(assertion, index, errors));
  }

  if (errors.length > 0) {
    throw new Error(`Invalid scenario definition: ${errors.join("; ")}.`);
  }
  return value as unknown as CombatScenario;
}

function validateHostile(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`hostileCreeps[${index}] must be an object`);
    return;
  }
  if (!isNonEmptyString(value.name)) errors.push(`hostileCreeps[${index}].name must be non-empty`);
  if (!isNonEmptyString(value.roomName)) errors.push(`hostileCreeps[${index}].roomName must be non-empty`);
  if (!isRoomCoordinate(value.x)) errors.push(`hostileCreeps[${index}].x must be 0..49`);
  if (!isRoomCoordinate(value.y)) errors.push(`hostileCreeps[${index}].y must be 0..49`);
  if (!Array.isArray(value.body) || value.body.length === 0) {
    errors.push(`hostileCreeps[${index}].body must be non-empty`);
  } else {
    for (const part of value.body) {
      if (!BODY_PARTS.has(part as BodyPartName)) {
        errors.push(`hostileCreeps[${index}].body contains invalid part ${String(part)}`);
      }
    }
  }
  if (value.hits !== undefined && !isPositiveInteger(value.hits)) {
    errors.push(`hostileCreeps[${index}].hits must be a positive integer`);
  }
  if (value.action !== undefined && !HOSTILE_ACTIONS.has(String(value.action))) {
    errors.push(`hostileCreeps[${index}].action must be hold, approachSpawn, or attackSpawn`);
  }
}

function validateAssertion(value: unknown, index: number, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`assertions[${index}] must be an object`);
    return;
  }
  if (!isNonEmptyString(value.label)) errors.push(`assertions[${index}].label must be non-empty`);
  if (!isNonEmptyString(value.type) || !ASSERTION_TYPES.has(value.type)) {
    errors.push(`assertions[${index}].type is unsupported`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRoomCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 49;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
