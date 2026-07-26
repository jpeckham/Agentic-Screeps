import { BUILD_INFO } from "../runtime/build-info.js";
import type { ColonySnapshot } from "../colony/colony-snapshot.js";
import type { ColonyStatus } from "../colony/colony-status.js";

export function drawRoomStatusVisual(options: {
  snapshot: ColonySnapshot;
  status: ColonyStatus;
}): void {
  const visual = options.snapshot.room.visual;
  const anchor = options.snapshot.spawns[0]?.pos ?? options.snapshot.controller?.pos;
  if (!visual || !anchor) return;

  const lines = [
    `RCL: ${options.status.rcl}`,
    `Mode: ${options.status.mode}`,
    `Energy: ${options.status.energy.available} / ${options.status.energy.capacity}`,
    `Workers: ${options.status.workers.actual} / ${options.status.workers.desired}`,
    `Strategy: ${options.status.strategy}`,
    `Defense: ${options.status.defense.posture.toUpperCase()}`,
    `Threat: ${options.status.threat.severity.toUpperCase()} hostiles ${options.status.threat.hostileCount}`,
    "Assignments:",
    `Harvest ${options.status.assignments.harvest}`,
    `Deliver ${options.status.assignments.deliver}`,
    `Upgrade ${options.status.assignments.upgrade}`,
    `Build ${options.status.assignments.build}`,
    `Repair ${options.status.assignments.repair}`,
    `Build sites: ${options.status.constructionSiteCount}`,
    `CPU: ${options.status.cpuUsed.toFixed(1)}`,
    `Release: ${BUILD_INFO.shortGitSha}`
  ];

  visual.text(lines.join("\n"), anchor.x, Math.max(1, anchor.y - 3), {
    align: "left",
    opacity: 0.8
  });
}
