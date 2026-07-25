import { BUILD_INFO } from "../runtime/build-info.js";
import type { ColonySnapshot } from "../colony/colony-snapshot.js";
import type { ColonyMemory } from "../colony/colony-state.js";

export function drawRoomStatusVisual(options: {
  snapshot: ColonySnapshot;
  memory: ColonyMemory;
  workers: number;
  desiredWorkers: number;
  cpuUsed: number;
}): void {
  const visual = options.snapshot.room.visual;
  const anchor = options.snapshot.spawns[0]?.pos ?? options.snapshot.controller?.pos;
  if (!visual || !anchor) return;

  const assignments = countAssignments(options.snapshot.workers);
  const lines = [
    `RCL: ${options.snapshot.rcl}`,
    `Mode: ${options.memory.emergency ? "EMERGENCY" : "NORMAL"}`,
    `Energy: ${options.snapshot.energyAvailable} / ${options.snapshot.energyCapacityAvailable}`,
    `Workers: ${options.workers} / ${options.desiredWorkers}`,
    "Assignments:",
    `Harvest ${assignments.harvest}`,
    `Deliver ${assignments.deliver}`,
    `Upgrade ${assignments.upgrade}`,
    `Build ${assignments.build}`,
    `Repair ${assignments.repair}`,
    `Build sites: ${options.snapshot.constructionSites.length}`,
    `CPU: ${options.cpuUsed.toFixed(1)}`,
    `Release: ${BUILD_INFO.shortGitSha}`
  ];

  visual.text(lines.join("\n"), anchor.x, Math.max(1, anchor.y - 3), {
    align: "left",
    opacity: 0.8
  });
}

function countAssignments(workers: ColonySnapshot["workers"]): {
  harvest: number;
  deliver: number;
  upgrade: number;
  build: number;
  repair: number;
} {
  const counts = { harvest: 0, deliver: 0, upgrade: 0, build: 0, repair: 0 };
  for (const worker of workers) {
    const assignment = worker.memory?.["assignment"];
    if (isAssignmentType(assignment, "harvest")) counts.harvest += 1;
    if (isAssignmentType(assignment, "deliver")) counts.deliver += 1;
    if (isAssignmentType(assignment, "upgrade")) counts.upgrade += 1;
    if (isAssignmentType(assignment, "build")) counts.build += 1;
    if (isAssignmentType(assignment, "repair")) counts.repair += 1;
  }
  return counts;
}

function isAssignmentType(value: unknown, type: string): boolean {
  return typeof value === "object" && value !== null && "type" in value && value.type === type;
}
