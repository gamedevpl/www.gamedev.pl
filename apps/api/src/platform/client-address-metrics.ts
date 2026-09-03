// unattributable_client telemetry. Message string is a contract with setup-monitoring.sh.

export const UNATTRIBUTABLE_CLIENT_LOG_MSG = 'unattributable client address';

// The unspecified address in either family, never a real caller.
const UNATTRIBUTABLE = new Set(['0.0.0.0', '::', '::0', '']);

export function isUnattributable(clientIp: string): boolean {
  return UNATTRIBUTABLE.has(clientIp.trim());
}

export interface UnattributableClientTelemetry {
  // The route pattern, never the raw URL, to keep ids out.
  route: string;
  method: string;
  statusCode: number;
  // 429 here is the whole question: did a limiter actually refuse someone.
  rateLimited: boolean;
  authenticated: boolean;
  forwardedFor: string | null;
}

interface Logger {
  warn: (context: object, message: string) => void;
}

export function logUnattributableClient(log: Logger, telemetry: UnattributableClientTelemetry): void {
  log.warn({ unattributableClient: telemetry }, UNATTRIBUTABLE_CLIENT_LOG_MSG);
}
