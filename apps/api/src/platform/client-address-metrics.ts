// unattributable_client telemetry. Message string is a contract with setup-monitoring.sh.

export const UNATTRIBUTABLE_CLIENT_LOG_MSG = 'unattributable client address';

// Separate message: only an IP-keyed limiter can prove the bucket refused.
export const IP_BUCKET_REFUSAL_LOG_MSG = 'unattributable client refused by ip limiter';

// The unspecified address in either family, never a real caller.
const UNATTRIBUTABLE = new Set(['0.0.0.0', '::', '::0', '']);

export function isUnattributable(clientIp: string): boolean {
  return UNATTRIBUTABLE.has(clientIp.trim());
}

export interface UnattributableClientTelemetry {
  // The route pattern, never the raw URL, to keep ids out.
  route: string;
  method: string;
  // Context only: a 429 here may be an account quota.
  statusCode: number;
  authenticated: boolean;
  forwardedFor: string | null;
}

interface Logger {
  warn: (context: object, message: string) => void;
}

export function logUnattributableClient(log: Logger, telemetry: UnattributableClientTelemetry): void {
  log.warn({ unattributableClient: telemetry }, UNATTRIBUTABLE_CLIENT_LOG_MSG);
}

export function logIpBucketRefusal(log: Logger, telemetry: { clientIp: string }): void {
  log.warn({ ipBucketRefusal: telemetry }, IP_BUCKET_REFUSAL_LOG_MSG);
}
