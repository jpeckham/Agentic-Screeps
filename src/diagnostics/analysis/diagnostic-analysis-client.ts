import { readFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";

import {
  DIAGNOSTIC_ANALYSIS_PROMPT_PATH,
  type DiagnosticAnalysisClient,
  type DiagnosticAnalysisRequest,
  type DiagnosticAnalysisResponse
} from "./analysis-contracts.js";
import { parseDiagnosticAnalysisResponse } from "./structured-response-validator.js";

export class FakeDiagnosticAnalysisClient implements DiagnosticAnalysisClient {
  readonly requests: DiagnosticAnalysisRequest[] = [];
  private responseIndex = 0;

  constructor(private readonly responses: DiagnosticAnalysisResponse[] = []) {}

  async analyze(request: DiagnosticAnalysisRequest): Promise<DiagnosticAnalysisResponse> {
    this.requests.push(request);
    const response = this.responses[Math.min(this.responseIndex, this.responses.length - 1)];
    this.responseIndex += 1;
    if (!response) return createDeterministicFakeAnalysisResponse(request);
    return structuredClone(response);
  }
}

export function createDeterministicFakeAnalysisResponse(request: DiagnosticAnalysisRequest): DiagnosticAnalysisResponse {
  const correlated = request.deterministicFindings.find((finding) =>
    finding.ruleId === "LOGISTICS_BACKPRESSURE_CAUSED_BY_DELAYED_REPLACEMENT"
  );
  const primaryFinding = correlated ?? request.deterministicFindings[0];
  const citedEvidenceIds = primaryFinding?.citedEvidenceIds.slice(0, 3) ?? request.evidence.slice(0, 2).map((item) => item.evidenceId);
  const metricEvidenceIds = request.selectedMetrics.slice(0, 2).map((metric) => metric.evidenceId);
  const support = [...new Set([...citedEvidenceIds.slice(1), ...metricEvidenceIds])].slice(0, 2);
  const codeContextId = request.codeContext?.find((item) => item.subsystem === "Creep replacement policy")?.contextId ??
    request.codeContext?.[0]?.contextId ?? "CODE-001";
  const isControl = !correlated && request.run.scenarioId.includes("control");
  const findingId = primaryFinding?.findingId ?? `${request.run.runId}:NO_FINDING`;
  return {
    analysisVersion: request.analysisVersion,
    findingAssessments: primaryFinding ? [
      {
        findingId,
        conclusion: correlated || isControl ? "supported" : "partially-supported",
        explanation: isControl
          ? "The deterministic evidence supports a temporary hauling deficit with timely recovery; it does not establish delayed-replacement backpressure."
          : "The deterministic evidence supports the finding: hauling capacity loss preceded source backpressure, and replacement delay remained inside the degraded logistics window.",
        citedEvidenceIds,
        causalHypotheses: [
          {
            hypothesisId: "HYP-FAKE-001",
            description: isControl
              ? "The temporary deficit recovered before source backpressure became the root cause."
              : "Replacement timing kept hauling capacity below demand long enough to contribute to source pressure.",
            confidence: correlated ? "high" : "medium",
            supportingEvidenceIds: support.length >= 2 ? support : citedEvidenceIds.slice(0, 2),
            contradictingEvidenceIds: request.evidence.filter((item) => item.description.includes("contradicts")).map((item) => item.evidenceId),
            relevantCodeContextIds: [codeContextId],
            verificationSteps: ["Compare loss, request, spawn, hauling-capacity, and source-fullness evidence in one timeline."]
          }
        ],
        alternativeExplanations: [
          {
            description: "Spawn prioritization is only supported when queue-ordering evidence is present.",
            supportingEvidenceIds: [],
            evidenceNeeded: ["Replacement request queue position and queued-ahead request identity."]
          }
        ]
      }
    ] : [],
    overallAssessment: {
        summary: isControl
          ? "The control report demonstrates timely recovery rather than the delayed-replacement correlated root cause."
        : "The delayed report supports replacement delay as a causal factor while leaving spawn prioritization unproven without queue-ordering evidence.",
      citedEvidenceIds: citedEvidenceIds.length ? citedEvidenceIds : request.evidence.slice(0, 1).map((item) => item.evidenceId)
    },
    recommendedInvestigations: [
      {
        priority: 1,
        title: "Trace replacement timing",
        rationale: "This is the smallest investigation that separates demand, request creation, priority, spawn latency, body adequacy, and movement causes.",
        relatedFindingIds: primaryFinding ? [findingId] : [],
        relatedEvidenceIds: citedEvidenceIds,
        relevantCodeContextIds: [codeContextId],
        steps: ["Log hauler loss tick, replacement request tick, queue position, spawn start tick, spawn completion tick, and first successful delivery tick."],
        expectedObservation: "The timeline identifies which step accounts for the replacement gap.",
        stopCondition: "Stop when the delayed step is isolated or all measured steps are inside tolerance."
      }
    ],
    reproductionAssessment: {
      summary: isControl
        ? "The control scenario is useful as a regression guard for timely recovery."
        : "The delayed scenario is useful as a reproduction and regression-test seed; it should add queue-ordering telemetry before assigning spawn-priority blame.",
      citedEvidenceIds
    },
    evidenceGaps: [
      {
        description: "Need telemetry for demand calculation, request creation, queue priority, spawn duration, body adequacy, pathing, and congestion.",
        whyItMatters: "These separate plausible code-level causes without treating speculation as fact.",
        suggestedTelemetry: [
          "logistics.requiredHaulingCapacityReason",
          "spawn.replacementQueuePosition",
          "spawn.replacementBodyCapacity",
          "hauler.pathBlockedTicks"
        ]
      }
    ],
    unsupportedClaims: [
      {
        claim: "Spawn prioritization caused the replacement delay.",
        reasonUnsupported: "This requires explicit queue-ordering evidence showing other requests ahead of the replacement."
      }
    ]
  };
}

export interface OpenAiDiagnosticAnalysisClientOptions {
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  transport?: OpenAiJsonTransport;
}

export interface OpenAiJsonTransportRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
}

export type OpenAiJsonTransport = (request: OpenAiJsonTransportRequest) => Promise<unknown>;

export class OpenAiDiagnosticAnalysisClient implements DiagnosticAnalysisClient {
  constructor(private readonly options: OpenAiDiagnosticAnalysisClientOptions) {}

  async analyze(request: DiagnosticAnalysisRequest): Promise<DiagnosticAnalysisResponse> {
    const prompt = await readFile(DIAGNOSTIC_ANALYSIS_PROMPT_PATH, "utf8");
    const transport = this.options.transport ?? defaultOpenAiJsonTransport;
    const body = await transport({
      url: "https://api.openai.com/v1/responses",
      timeoutMs: this.options.timeoutMs ?? 60_000,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body: {
        model: this.options.model,
        input: [
          { role: "system", content: prompt },
          { role: "user", content: JSON.stringify(request) }
        ],
        max_output_tokens: this.options.maxOutputTokens ?? 4_000,
        text: {
          format: { type: "json_object" }
        }
      }
    });
    const outputText = extractOpenAiOutputText(body);
    if (!outputText) throw new Error("OpenAI diagnostic analysis response did not include structured output text.");
    return parseDiagnosticAnalysisResponse(JSON.parse(outputText));
  }
}

export function extractOpenAiOutputText(body: unknown): string | undefined {
  if (isRecord(body) && typeof body.output_text === "string") return body.output_text;
  if (!isRecord(body) || !Array.isArray(body.output)) return undefined;
  for (const output of body.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (isRecord(content) && typeof content.text === "string") return content.text;
    }
  }
  return undefined;
}

export async function defaultOpenAiJsonTransport(input: OpenAiJsonTransportRequest): Promise<unknown> {
  const payload = JSON.stringify(input.body);
  return await new Promise((resolve, reject) => {
    const request = httpsRequest(input.url, {
      method: "POST",
      timeout: input.timeoutMs,
      headers: {
        ...input.headers,
        "content-length": Buffer.byteLength(payload).toString()
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const body = parseJsonBody(text);
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const message = isRecord(body) && isRecord(body.error) && typeof body.error.message === "string"
            ? body.error.message
            : `HTTP ${response.statusCode ?? "unknown"}`;
          reject(new Error(`OpenAI diagnostic analysis failed: ${message}`));
          return;
        }
        resolve(body);
      });
    });
    request.on("timeout", () => request.destroy(new Error(`OpenAI diagnostic analysis timed out after ${input.timeoutMs}ms.`)));
    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function parseJsonBody(text: string): unknown {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("OpenAI diagnostic analysis response was not JSON.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
