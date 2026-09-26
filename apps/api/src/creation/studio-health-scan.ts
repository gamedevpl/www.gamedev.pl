import type { Store, TelemetryEvent } from '../platform/store.js';

const MAX_EVENTS_PER_DAY = 1000;
const MAX_EVENTS_PER_REQUEST = 5_000;
export const MAX_STUDIO_HEALTH_QUERIES = 150;

export async function scanOwnedSlugs(
  store: Store,
  slugs: string[],
  days: string[],
): Promise<{ events: TelemetryEvent[]; scanned: string[]; truncated: boolean }> {
  const events: TelemetryEvent[] = [];
  const scanned: string[] = [];
  let truncated = false;
  let queryCount = 0;

  for (const [dayIndex, dateStr] of days.entries()) {
    let dayHadRoom = false;
    for (const slug of slugs) {
      if (queryCount >= MAX_STUDIO_HEALTH_QUERIES) {
        truncated = true;
        break;
      }
      const remaining = MAX_EVENTS_PER_REQUEST - events.length;
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const limit = Math.min(MAX_EVENTS_PER_DAY, remaining);
      queryCount += 1;
      const dayEvents = await store.listTelemetryEvents(dateStr, { slug, limit });
      if (dayEvents.length >= limit) truncated = true;
      events.push(...dayEvents);
      dayHadRoom = true;
    }
    if (!dayHadRoom && events.length >= MAX_EVENTS_PER_REQUEST) {
      truncated = true;
      break;
    }
    if (dayHadRoom) scanned.push(dateStr);
    if (events.length >= MAX_EVENTS_PER_REQUEST) {
      truncated = true;
      break;
    }
    if (queryCount >= MAX_STUDIO_HEALTH_QUERIES) {
      if (dayIndex < days.length - 1) truncated = true;
      break;
    }
  }

  return { events, scanned, truncated };
}

// Only cache misses spend this; hits and empty shelves are free.
export const MAX_STUDIO_HEALTH_SCANS_PER_HOUR = 30;
const HOUR_MS = 60 * 60_000;

export class StudioHealthBudgetError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('studio health scan budget exhausted');
  }
}

// Shared through the store, so every instance draws on one hourly budget.
export async function spendStudioHealthScan(store: Store, uid: string, nowMs: number): Promise<void> {
  const hour = new Date(nowMs).toISOString().slice(0, 13);
  const { allowed } = await store.checkAndIncrementStudioHealthScans(uid, hour, MAX_STUDIO_HEALTH_SCANS_PER_HOUR);
  if (!allowed) throw new StudioHealthBudgetError(Math.max(1, Math.ceil((HOUR_MS - (nowMs % HOUR_MS)) / 1000)));
}
