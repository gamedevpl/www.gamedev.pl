import type { CodeLanguage } from './codeTokens.js';
import type { CodeSurfaceSources } from './codeSurfaceApi.js';

export const AUTOSAVE_MS = 1500;

// "Agent is editing" banner duration after the last WebMCP tool call.
export const AGENT_ACTIVITY_BANNER_MS = 4_000;
export const TYPECHECK_DEBOUNCE_MS = 400;

// Wait after the last stage write before arming a preview rebuild.
export const PREVIEW_DEBOUNCE_MS = 2_500;

// Mirrors staged-preview.ts: the floor between rebuilds.
export const STAGE_REBUILD_COOLDOWN_MS = 25_000;

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';
export type RebuildState = 'idle' | 'pending' | 'cooling';
export type DiscardState = 'idle' | 'discarding';

// Track 2's near-instant preview, distinct from the debounced rebuildState.
export type SyncPreviewState = 'idle' | 'pending' | 'ready';

// type-check.ts's file:line: message shape, into a structured diagnostic.
export function parseDiagnostic(raw: string): { path: string; line: number; message: string } | null {
  const match = /^(.+?):(\d+): (.+)$/.exec(raw);
  if (!match) return null;
  return { path: match[1]!, line: Number(match[2]), message: match[3]! };
}

export function languageFor(path: string): CodeLanguage {
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
}

// GA-04: mirrors type-check.ts's own .ts filter.
export function isTsPath(path: string): boolean {
  return path.endsWith('.ts') || path.endsWith('.tsx');
}

export function markFileStaged(sources: CodeSurfaceSources, path: string, content: string): CodeSurfaceSources {
  const lines = content.split('\n').length;
  const bytes = new TextEncoder().encode(content).length;
  return {
    ...sources,
    files: sources.files.map((entry) =>
      entry.path === path
        ? {
            ...entry,
            content,
            stagedBy: 'owner',
            budget: entry.budget
              ? {
                  ...entry.budget,
                  lines,
                  bytes,
                  oversize: lines > entry.budget.maxLines || bytes > entry.budget.maxBytes,
                }
              : undefined,
          }
        : entry,
    ),
  };
}
