import type { ApiClient } from './api.js';
import { chooseExecution, executeChoice } from './execution.js';
import { formatError } from './errors.js';
import type { ReplLineResult } from './repl.js';
import type { Workshop, PickChoice } from './workshop.js';
import type { CliTelemetry } from './telemetry.js';

export async function improvePublished(input: {
  api: ApiClient;
  token: string;
  request: string;
  slug: string;
  env: NodeJS.ProcessEnv;
  pick: PickChoice;
  workshop?: Workshop;
  write: (line: string) => void;
  abort: Workshop['abort'];
  telemetry?: CliTelemetry;
  onWorkshop?: (ws: Workshop) => void;
}): Promise<ReplLineResult> {
  const choice = await chooseExecution(input);
  if (!choice) return { next: 'continue' };
  input.telemetry?.record('build_requested');
  const created = await input.api.request<{ ok: boolean; token?: string; slug?: string; reply?: string }>(
    'POST',
    `/api/submissions/${encodeURIComponent(input.token)}/improve`,
    { feedback: input.request, builder: choice.builder },
  );
  if (!created.token || !created.slug) {
    input.write(created.reply?.trim() || 'No improvement round was opened. Please clarify what you want to change.');
    return { next: 'continue' };
  }
  input.write(`▸ opened improvement for ${created.slug}`);
  const workshop =
    input.workshop && created.slug === input.workshop.slug
      ? { ...input.workshop, token: created.token, builder: choice.builder }
      : undefined;
  const opened: ReplLineResult = { next: 'continue', token: created.token, slug: created.slug, workshop };
  try {
    opened.workshop = await executeChoice({ ...input, choice, token: created.token, slug: created.slug, workshop });
  } catch (error) {
    input.write(formatError(error));
  }
  return opened;
}
