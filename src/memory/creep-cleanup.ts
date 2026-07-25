export function cleanupDeadCreepMemory(
  memory: { creeps?: Record<string, unknown> },
  liveCreeps: Record<string, unknown>
): void {
  if (!memory.creeps) return;
  for (const name of Object.keys(memory.creeps)) {
    if (!(name in liveCreeps)) {
      delete memory.creeps[name];
    }
  }
}
