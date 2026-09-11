import {
  completionStatus,
  currentCompletions,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { tsAutocomplete } from '@valtown/codemirror-ts';
import { recordCodeCompletion } from '../../visitTelemetry.js';

type CompletionAttempt = {
  context: CompletionContext;
  startedAt: number;
  candidateCount: number;
  options: CompletionResult['options'];
  settled: boolean;
};

export type CompletionTracker = { pending: CompletionAttempt[] };

function settleCompletionAttempt(tracker: CompletionTracker, attempt: CompletionAttempt, shown: boolean): void {
  if (attempt.settled) return;
  attempt.settled = true;
  tracker.pending = tracker.pending.filter((pending) => pending !== attempt);
  recordCodeCompletion({
    kind: 'language_service',
    outcome: shown ? 'shown' : 'empty',
    latencyMs: performance.now() - attempt.startedAt,
    candidateCount: attempt.candidateCount,
  });
}

export function completionVisibilityExtension(tracker: CompletionTracker): Extension {
  return ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate): void {
        if (tracker.pending.length === 0) return;
        if (tracker.pending.some((attempt) => attempt.context.aborted)) {
          for (const attempt of [...tracker.pending]) {
            if (attempt.context.aborted) settleCompletionAttempt(tracker, attempt, false);
          }
        }

        if (tracker.pending.length === 0) return;
        const status = completionStatus(update.state);
        if (status === 'pending') return;
        const visibleOptions = currentCompletions(update.state);
        for (const attempt of [...tracker.pending]) {
          const shown = status === 'active' && visibleOptions.some((option) => attempt.options.includes(option));
          const settledAsEmpty = status !== 'active' || visibleOptions.length === 0;
          if (shown || settledAsEmpty) settleCompletionAttempt(tracker, attempt, shown);
        }
      }

      destroy(): void {
        for (const attempt of [...tracker.pending]) settleCompletionAttempt(tracker, attempt, false);
      }
    },
  );
}

export function measuredTsAutocomplete(tracker: CompletionTracker): CompletionSource {
  const source = tsAutocomplete();
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const startedAt = performance.now();
    try {
      const result = await source(context);
      if (context.aborted) {
        recordCodeCompletion({
          kind: 'language_service',
          outcome: 'empty',
          latencyMs: performance.now() - startedAt,
          candidateCount: result?.options.length ?? 0,
        });
        return null;
      }
      if (!result?.options.length) {
        recordCodeCompletion({
          kind: 'language_service',
          outcome: 'empty',
          latencyMs: performance.now() - startedAt,
          candidateCount: 0,
        });
        return result;
      }
      const attempt: CompletionAttempt = {
        context,
        startedAt,
        candidateCount: result.options.length,
        options: result.options,
        settled: false,
      };
      tracker.pending.push(attempt);
      context.addEventListener('abort', () => settleCompletionAttempt(tracker, attempt, false), { onDocChange: true });
      return result ? { ...result, validFor: result.validFor ?? /^[\w$]*$/ } : null;
    } catch (error) {
      recordCodeCompletion({
        kind: 'language_service',
        outcome: 'failed',
        latencyMs: performance.now() - startedAt,
      });
      throw error;
    }
  };
}
