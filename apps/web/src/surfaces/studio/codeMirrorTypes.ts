import type { WorkerShape } from '@valtown/codemirror-ts/worker';
import type { CodeCompletionKind, CodeCompletionOutcome } from '@gamedevpl/contract';

export type CodeMirrorDiagnostic = { line: number; message: string; severity?: 'error' | 'warning' };

// GA-05: the worker bound to this editor's open file.
export type CodeMirrorLanguageService = { worker: Omit<WorkerShape, 'initialize'>; path: string };

// GA-09: cmd/ctrl-click target — path is vfs-rooted.
export type GotoDefinitionHandler = (path: string, from: number, to: number) => void;

// TA-02: ghost-text proposal for the window around the cursor.
export type FetchGhostText = (prefixWindow: string, suffixWindow: string, signal: AbortSignal) => Promise<string>;

export type CompletionMetric = {
  kind: CodeCompletionKind;
  outcome: CodeCompletionOutcome;
  latencyMs: number;
  candidateCount?: number;
  completionChars?: number;
};
export type CompletionReporter = (metric: CompletionMetric) => void;
export const ignoreCompletionMetric: CompletionReporter = () => {};
