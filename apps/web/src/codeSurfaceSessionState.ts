// Selection/drafts kept across the panel's unmounts.

export type CodeSurfaceSessionState = { selected: string | null; drafts: Record<string, string> };

const sessionStateBySlug = new Map<string, CodeSurfaceSessionState>();

export function getCodeSurfaceSessionState(slug: string): CodeSurfaceSessionState | undefined {
  return sessionStateBySlug.get(slug);
}

export function setCodeSurfaceSessionState(slug: string, state: CodeSurfaceSessionState): void {
  sessionStateBySlug.set(slug, state);
}

// Test seam: the module-level cache outlives tests.
export function resetCodeSurfaceSessionState(): void {
  sessionStateBySlug.clear();
}
