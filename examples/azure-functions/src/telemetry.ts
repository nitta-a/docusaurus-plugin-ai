import type { InvocationContext } from '@azure/functions';

export interface TelemetryMetrics {
  readonly latencyMs: number;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly sourcesCount: number;
  readonly isStream: boolean;
}

/** Emit a structured event that Application Insights can query as custom dimensions. */
export const logAICallMetrics = (
  context: InvocationContext,
  metrics: TelemetryMetrics,
  extraProps: Record<string, string | number> = {},
): void => {
  context.log('AI Request Telemetry', {
    ...extraProps,
    durationMs: metrics.latencyMs,
    promptTokens: metrics.promptTokens ?? 0,
    completionTokens: metrics.completionTokens ?? 0,
    totalTokens: metrics.totalTokens ?? 0,
    sourcesCount: metrics.sourcesCount,
    isStream: metrics.isStream,
    timestamp: new Date().toISOString(),
  });
};
