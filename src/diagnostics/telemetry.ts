export interface DiagnosticEvent {
  runId: string;
  scenarioId: string;
  gameTick: number;
  roomName?: string;
  subsystem: string;
  eventType: string;
  entityId?: string;
  measurements?: Record<string, number>;
  context?: Record<string, string | number | boolean>;
  codeVersion?: string;
}

export interface MetricSample {
  runId: string;
  scenarioId: string;
  gameTick: number;
  roomName?: string;
  metricName: string;
  value: number;
  unit?: string;
  dimensions?: Record<string, string>;
}

export interface DiagnosticTelemetry {
  events: DiagnosticEvent[];
  metrics: MetricSample[];
}

export interface DiagnosticRecorder {
  recordEvent(event: DiagnosticEvent): void;
  recordMetric(metric: MetricSample): void;
  flush(): DiagnosticTelemetry;
}

export class NoOpDiagnosticRecorder implements DiagnosticRecorder {
  recordEvent(): void {}
  recordMetric(): void {}
  flush(): DiagnosticTelemetry {
    return { events: [], metrics: [] };
  }
}

export class SimulationDiagnosticRecorder implements DiagnosticRecorder {
  private readonly events: DiagnosticEvent[] = [];
  private readonly metrics: MetricSample[] = [];

  recordEvent(event: DiagnosticEvent): void {
    this.events.push({ ...event });
  }

  recordMetric(metric: MetricSample): void {
    this.metrics.push({ ...metric });
  }

  flush(): DiagnosticTelemetry {
    return {
      events: this.events.map((event) => ({ ...event })),
      metrics: this.metrics.map((metric) => ({ ...metric }))
    };
  }
}
