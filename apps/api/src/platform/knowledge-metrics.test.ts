import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_QUERY_LOG_MSG, logKnowledgeQuery } from './knowledge-metrics.js';

const here = dirname(fileURLToPath(import.meta.url));

function fakeLog() {
  const infos: Array<{ obj: unknown; msg: unknown }> = [];
  return { infos, logger: { info: (obj: object, msg: string) => infos.push({ obj, msg }) } };
}

describe('logKnowledgeQuery', () => {
  it('uses a stable message, because a log filter matches on it', () => {
    const { infos, logger } = fakeLog();
    logKnowledgeQuery(logger, {
      jobId: 9,
      mode: 'answer',
      scope: 'kit',
      cacheHit: false,
      fallback: false,
      truncated: false,
      chunkCount: 3,
      warningCodes: [],
      ms: 640,
    });

    expect(KNOWLEDGE_QUERY_LOG_MSG).toBe('knowledge_query answered');
    expect(infos[0]?.msg).toBe(KNOWLEDGE_QUERY_LOG_MSG);
    expect(infos[0]?.obj).toEqual({
      knowledgeQuery: {
        jobId: 9,
        mode: 'answer',
        scope: 'kit',
        cacheHit: false,
        fallback: false,
        truncated: false,
        chunkCount: 3,
        warningCodes: [],
        ms: 640,
      },
    });
  });
});

describe('the alert that reads these logs', () => {
  const script = readFileSync(resolve(here, '../../../../infra/setup-monitoring.sh'), 'utf8');

  it('filters on the message this module emits', () => {
    expect(script).toContain(KNOWLEDGE_QUERY_LOG_MSG);
  });
});

describe('the only place that reports knowledge_query calls', () => {
  it('is agent-channel.ts, through this module', () => {
    const agentChannel = readFileSync(resolve(here, '..', 'agent-surface', 'agent-channel.ts'), 'utf8');
    expect(agentChannel).toContain('logKnowledgeQuery(');
  });
});
