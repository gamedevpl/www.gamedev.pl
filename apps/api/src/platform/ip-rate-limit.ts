type RefusalObserver = (ip: string) => void;

let observeRefusal: RefusalObserver | null = null;

// Only this helper knows it refused, and on which key.
export function onIpRefusal(observer: RefusalObserver | null): void {
  observeRefusal = observer;
}

// Sliding-window rate limiter keyed by client IP.
export function isRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  currentTime: number,
  maxRequests: number,
  windowMs: number,
): boolean {
  const requests = (buckets.get(ip) ?? []).filter((timestamp) => currentTime - timestamp < windowMs);
  if (requests.length >= maxRequests) {
    buckets.set(ip, requests);
    observeRefusal?.(ip);
    return true;
  }

  requests.push(currentTime);
  buckets.set(ip, requests);
  return false;
}
