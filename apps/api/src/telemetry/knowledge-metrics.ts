// knowledge_query telemetry. Message string is a contract with setup-monitoring.sh.

export const KNOWLEDGE_QUERY_LOG_MSG = 'knowledge_query answered';

export interface KnowledgeQueryTelemetry {
  issueNumber: number;
  mode: 'answer' | 'chunks';
  scope?: string;
  cacheHit: boolean;
  fallback: boolean;
  truncated: boolean;
  chunkCount: number;
  warningCodes: string[];
  ms: number;
}

interface Logger {
  info: (context: object, message: string) => void;
}

export function logKnowledgeQuery(log: Logger, telemetry: KnowledgeQueryTelemetry): void {
  log.info({ knowledgeQuery: telemetry }, KNOWLEDGE_QUERY_LOG_MSG);
}
