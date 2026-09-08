import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function localModels(agent: string, env: NodeJS.ProcessEnv): Array<{ id: string; efforts?: string[] }> {
  if (agent === 'claude') return ['sonnet', 'opus', 'haiku'].map((id) => ({ id }));
  if (agent !== 'codex') return [];
  try {
    const path = join(env.CODEX_HOME ?? join(env.HOME ?? homedir(), '.codex'), 'models_cache.json');
    const data = JSON.parse(readFileSync(path, 'utf8')) as {
      models?: Array<{
        slug?: unknown;
        visibility?: unknown;
        supported_reasoning_levels?: Array<{ effort?: unknown }>;
      }>;
    };
    return (data.models ?? [])
      .filter((model) => typeof model.slug === 'string' && model.visibility !== 'hide')
      .map((model) => ({
        id: model.slug as string,
        efforts: model.supported_reasoning_levels?.flatMap((level) =>
          typeof level.effort === 'string' ? [level.effort] : [],
        ),
      }));
  } catch {
    return [];
  }
}
