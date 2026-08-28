// Client for the Code surface's own routes (creator-code-editing-execution-plan.md
// CE-03, CE-10, CE-11) — mirrors studioApi.ts's shape (a small typed fetch wrapper
// per route, one shared error class) rather than adding a dependency.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class CodeSurfaceApiError extends Error {
  status?: number;
  code?: string;
  // Required paths a refused delivery lacked; drives the fixit.
  missing?: string[];
}

async function throwResponseError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
    code?: string;
    missing?: string[];
  } | null;
  const error = new CodeSurfaceApiError(body?.message ?? body?.error ?? `Request failed (${response.status})`);
  error.status = response.status;
  // Some routes put the code in `error`, some name it explicitly.
  error.code = body?.code ?? body?.error;
  if (Array.isArray(body?.missing)) error.missing = body.missing.filter((path) => typeof path === 'string');
  throw error;
}

export type CodeSurfaceFileBudget = {
  bytes: number;
  lines: number;
  maxBytes: number;
  maxLines: number;
  oversize: boolean;
};

export type CodeSurfaceFile = {
  path: string;
  content: string;
  /** Present only when the staging buffer overrides the delivered content. */
  stagedBy?: 'agent' | 'owner';
  // Delivered content this staged edit overrides — see creator-code.ts.
  base?: string;
  budget?: CodeSurfaceFileBudget;
};

export type CodeSurfaceStagingSummary = {
  totalBytes: number;
  maxBytes: number;
  maxFiles: number;
  updatedAt: string | null;
};

export type CodeSurfaceSources = {
  slug: string;
  version: string | null;
  files: CodeSurfaceFile[];
  /** Paths staged for deletion — excluded from `files`. */
  deleted: string[];
  readOnly: boolean;
  reason?: 'agent_round';
  // Wider than readOnly; absent on older servers.
  agentRound?: boolean;
  staged: CodeSurfaceStagingSummary;
};

export async function fetchCodeSurfaceSources(slug: string): Promise<CodeSurfaceSources> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources`, {
    credentials: 'include',
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfaceSources;
}

export type CodeSurfaceStageResult = {
  accepted: true;
  path: string;
  bytes: number;
  hint?: string;
  // CE-17: set when this write opened a fresh round implicitly.
  roundOpened?: number;
  staged: CodeSurfaceStagingSummary;
};

export async function stageCodeSurfaceFile(
  slug: string,
  path: string,
  content: string,
  options?: { rebuild?: boolean; keepalive?: boolean; agentAuthored?: boolean },
): Promise<CodeSurfaceStageResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/stage`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    // Same keepalive technique telemetry.ts uses for its own final flush.
    ...(options?.keepalive ? { keepalive: true } : {}),
    body: JSON.stringify({
      path,
      content,
      ...(options?.rebuild === false ? { rebuild: false } : {}),
      ...(options?.agentAuthored ? { agentAuthored: true } : {}),
    }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfaceStageResult;
}

/** Arms the debounced staged-preview rebuild over the current working-copy buffer. */
export async function rebuildCodeSurfaceStage(slug: string): Promise<{ scheduled: true }> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/stage/rebuild`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as { scheduled: true };
}

export type CodeSurfacePreviewResult = { html: string; engineRef: string };

// Track 2's fast lane: builds the buffer, returns it inline.
export async function requestCodeSurfacePreview(slug: string): Promise<CodeSurfacePreviewResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/preview`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfacePreviewResult;
}

export type CodeSurfacePatchResult = CodeSurfaceStageResult & { replacements: number; baseFrom: 'staged' | 'delivery' };

export async function patchCodeSurfaceFile(
  slug: string,
  path: string,
  edit: { old: string; new: string } | { patch: string },
  options?: { agentAuthored?: boolean },
): Promise<CodeSurfacePatchResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/stage/patch`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, ...edit, ...(options?.agentAuthored ? { agentAuthored: true } : {}) }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfacePatchResult;
}

export type CodeSurfaceDeleteResult = {
  accepted: true;
  path: string;
  roundOpened?: number;
  staged: CodeSurfaceStagingSummary;
};

export async function deleteCodeSurfaceFile(slug: string, path: string): Promise<CodeSurfaceDeleteResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/stage/delete`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfaceDeleteResult;
}

export type CodeSurfaceRestoreResult = {
  accepted: true;
  path: string;
  bytes: number;
  // The delivery that still had it, or a generated stub.
  from: 'delivery' | 'stub';
  roundOpened?: number;
  staged: CodeSurfaceStagingSummary;
};

// Supplies a required file the game lacks.
export async function restoreCodeSurfaceFile(slug: string, path: string): Promise<CodeSurfaceRestoreResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/stage/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfaceRestoreResult;
}

export async function discardCodeSurfaceEdits(slug: string, paths?: string[]): Promise<{ cleared: number }> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/stage/discard`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(paths ? { paths } : {}),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as { cleared: number };
}

export type CodeSurfaceTypecheckResult = { ok: true } | { ok: false; errors: string[] };

export async function typecheckCodeSurface(
  slug: string,
  overlay?: Array<{ path: string; content: string }>,
): Promise<CodeSurfaceTypecheckResult> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/typecheck`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(overlay ? { overlay } : {}),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfaceTypecheckResult;
}

export type CodeSurfaceKitDeclaration = { engineRef: string; declaration: string };

// GA-01: advisory — null, not a throw, on any failure.
export async function fetchCodeSurfaceKitDeclaration(slug: string): Promise<CodeSurfaceKitDeclaration | null> {
  try {
    const response = await fetch(
      `${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/kit-declaration`,
      { credentials: 'include' },
    );
    if (!response.ok) return null;
    return (await response.json()) as CodeSurfaceKitDeclaration;
  } catch {
    return null;
  }
}

// TA-01: advisory-only; callers classify failures without surfacing them to users.
export async function fetchCodeSurfaceCompletion(
  slug: string,
  path: string,
  prefixWindow: string,
  suffixWindow: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/complete`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, prefixWindow, suffixWindow }),
      signal,
    });
    if (!response.ok) await throwResponseError(response);
    const body = (await response.json()) as { completion?: string };
    return body.completion ?? '';
  } catch (error) {
    if (signal.aborted) return '';
    throw error;
  }
}

export type CodeSurfaceDeliverOutcome =
  | {
      accepted: true;
      slug: string;
      version: string;
      mode: 'preview' | 'publish';
      gateStarted: boolean;
      buildId?: string;
    }
  | {
      accepted: false;
      rejected: 'stopped' | 'rate_limited' | 'delivery_cap';
      deliveryCap?: number;
      deliveriesUsed?: number;
    };

/** CE-18: the manual round's delivery, with the required IP attestation. */
export async function deliverCodeSurface(
  slug: string,
  mode: 'preview' | 'publish',
): Promise<CodeSurfaceDeliverOutcome> {
  const response = await fetch(`${API_BASE}/api/me/studio/games/${encodeURIComponent(slug)}/sources/deliver`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, attestation: true }),
  });
  if (!response.ok) await throwResponseError(response);
  return (await response.json()) as CodeSurfaceDeliverOutcome;
}
