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

  const lines = [
    `RCL: ${options.snapshot.rcl}`,
    `Mode: ${options.memory.emergency ? "EMERGENCY" : "NORMAL"}`,
    `Energy: ${options.snapshot.energyAvailable} / ${options.snapshot.energyCapacityAvailable}`,
    `Workers: ${options.workers} / ${options.desiredWorkers}`,
    `Build sites: ${options.snapshot.constructionSites.length}`,
    `CPU: ${options.cpuUsed.toFixed(1)}`,
    `Release: ${BUILD_INFO.shortGitSha}`
  ];

  visual.text(lines.join("\n"), anchor.x, Math.max(1, anchor.y - 3), {
    align: "left",
    opacity: 0.8
  });
}
