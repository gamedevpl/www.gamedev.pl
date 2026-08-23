// Precedent and shape: gate-crash.ts.

import type { SubmissionRecord } from './platform/store.js';
import { canTransition, type JobStall, type JobTransition } from './job-state.js';

// Two: one blip is noise, two in a row is not.
export const SESSION_CRASH_THRESHOLD = 2;

// In-memory, per ref; a restart re-counts from zero.
const failures = new Map<string, number>();

// True once `ref` has failed its threshold.
export function noteObserveFailure(ref: string): boolean {
  const count = (failures.get(ref) ?? 0) + 1;
  failures.set(ref, count);
  return count >= SESSION_CRASH_THRESHOLD;
}

// Call on every successful observe.
export function clearObserveFailures(ref: string): void {
  failures.delete(ref);
}

// Test seam.
export function resetSessionCrashCounters(): void {
  failures.clear();
}

// needs_changes, not failed — same reasoning as gate_crashed.
export function sessionCrashTransition(state: SubmissionRecord['state'], now: () => number): JobTransition | null {
  const from = state ?? 'queued';
  if (!canTransition(from, 'needs_changes')) return null;
  return { to: 'needs_changes', at: new Date(now()).toISOString(), by: 'reconciler', reason: 'session_crashed' };
}

// Append-ordered, so the last entry is current; see gateCrashStall for why.
export function sessionCrashStall(record: Pick<SubmissionRecord, 'state' | 'transitions'>): JobStall | null {
  if (record.state !== 'needs_changes') return null;
  const last = record.transitions?.[record.transitions.length - 1];
  return last?.reason === 'session_crashed' ? 'session_crashed' : null;
}
