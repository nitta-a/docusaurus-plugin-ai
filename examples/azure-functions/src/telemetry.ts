import type { InvocationContext } from '@azure/functions';
import type { SourceReference } from '@docusaurus-plugin-ai/core';

export interface RAGLogEntry {
  readonly traceId: string;
  readonly query: string;
  readonly retrievedCount: number;
  readonly sources: readonly Pick<SourceReference, 'title' | 'url'>[];
  readonly durationMs: {
    readonly retrieval: number;
    readonly total: number;
  };
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
  };
  readonly status: 'success' | 'error';
  readonly errorMessage?: string;
}

/** Emit one query-scoped event so retrieval and generation failures can be separated in Application Insights. */
export const logRAGTelemetry = (context: InvocationContext, entry: RAGLogEntry): void => {
  context.log(
    JSON.stringify({
      telemetryType: 'RAG_EXECUTION',
      ...entry,
      timestamp: new Date().toISOString(),
    }),
  );
};

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
