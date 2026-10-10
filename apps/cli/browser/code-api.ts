export class CodeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly data: { error?: string; status?: string; file?: CodeFile },
  ) {
    super(data.error ?? `Code request failed (${status})`);
  }
}
export type CodeFile = { path: string; content: string; version: string; readOnly: boolean };
export type CompletionStatus = { providers: { id: string; available: boolean }[]; selected: string | null };
export type CodeProject = { projectId: string; files: CodeFile[]; completion: CompletionStatus };
export async function codeApi<T>(path: string, data?: unknown, signal?: AbortSignal): Promise<T> {
  const token = sessionStorage.getItem('session-token') ?? '';
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok) throw new CodeRequestError(response.status, result);
  return result as T;
}
