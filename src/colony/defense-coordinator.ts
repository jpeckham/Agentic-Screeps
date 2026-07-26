import type { ThreatAssessment } from "./colony-snapshot.js";

export type DefensivePosture = "peace" | "alert" | "engage";

export interface DefenseDecision {
  posture: DefensivePosture;
  reason: string;
}

export class ColonyDefenseCoordinator {
  decide(threatAssessment: ThreatAssessment): DefenseDecision {
    if (threatAssessment.severity === "none") {
      return { posture: "peace", reason: "threat none" };
    }
    if (threatAssessment.severity === "low") {
      return { posture: "alert", reason: "threat low" };
    }
    return { posture: "engage", reason: `threat ${threatAssessment.severity}` };
  }
}

const coordinator = new ColonyDefenseCoordinator();

export function decideDefensePosture(threatAssessment: ThreatAssessment): DefenseDecision {
  return coordinator.decide(threatAssessment);
}
