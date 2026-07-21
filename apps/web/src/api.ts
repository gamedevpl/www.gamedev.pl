export interface GeneratedGame {
  title: string;
  description: string;
  html: string;
}

export type JobState = 'queued' | 'provisioning' | 'running' | 'succeeded' | 'failed';

interface JobStatus {
  id: string;
  state: JobState;
  error?: string;
  title?: string;
  description?: string;
  html?: string;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${response.status})`;
}

/** Synchronous path — kept for simple callers and tests. */
export async function generateGame(prompt: string): Promise<GeneratedGame> {
  const response = await fetch('/api/generate-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as GeneratedGame;
}

async function submitJob(prompt: string): Promise<string> {
  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) throw new Error(await readError(response));
  return ((await response.json()) as { id: string }).id;
}

async function fetchJob(id: string): Promise<JobStatus> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as JobStatus;
}

export interface GenerateOptions {
  /** Reports queue/lifecycle transitions so the UI can explain the wait. */
  onState?: (state: JobState) => void;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

/**
 * Queues a generation job and polls until it settles. Real agent runs take far
 * longer than a request should stay open, so the queue — not a long-held
 * connection — is what absorbs the wait.
 */
export async function generateGameViaJob(prompt: string, options: GenerateOptions = {}): Promise<GeneratedGame> {
  const { onState, pollIntervalMs = 500, timeoutMs = 10 * 60 * 1000 } = options;

  const id = await submitJob(prompt);
  const deadline = Date.now() + timeoutMs;
  let lastState: JobState | undefined;

  for (;;) {
    const job = await fetchJob(id);
    if (job.state !== lastState) {
      lastState = job.state;
      onState?.(job.state);
    }

    if (job.state === 'succeeded') {
      if (!job.html) throw new Error('generation finished but returned no game');
      return { title: job.title ?? 'Your game', description: job.description ?? '', html: job.html };
    }
    if (job.state === 'failed') {
      throw new Error(job.error ?? 'game generation failed');
    }
    if (Date.now() > deadline) {
      throw new Error('generation timed out');
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
