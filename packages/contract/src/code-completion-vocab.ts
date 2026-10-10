export const CODE_SURFACES = ['studio', 'local_play'] as const;
export type CodeTelemetrySurface = (typeof CODE_SURFACES)[number];
export interface LocalCodeMetrics {
  opened: number;
  fileOpened: number;
  edited: number;
  typechecked: number;
  conflicts: number;
  requests: number;
  shown: number;
  empty: number;
  failed: number;
  accepted: number;
  dismissed: number;
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
}
export const CODE_COMPLETION_KINDS = ['language_service', 'ghost_text'] as const;
export type CodeCompletionKind = (typeof CODE_COMPLETION_KINDS)[number];
export const CODE_COMPLETION_OUTCOMES = ['shown', 'empty', 'failed', 'accepted', 'dismissed'] as const;
export type CodeCompletionOutcome = (typeof CODE_COMPLETION_OUTCOMES)[number];
