import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CODE_STEPS, CODE_COMPLETION_KINDS, CODE_COMPLETION_OUTCOMES } from '@gamedevpl/contract';

export const codeMetricSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('code_step'), step: z.enum(CODE_STEPS) }).strict(),
  z
    .object({
      type: z.literal('code_completion'),
      kind: z.enum(CODE_COMPLETION_KINDS),
      outcome: z.enum(CODE_COMPLETION_OUTCOMES),
      latencyMs: z.number().min(0).max(30_000),
      candidateCount: z.number().int().min(0).max(5000).optional(),
      completionChars: z.number().int().min(0).max(4000).optional(),
    })
    .strict(),
]);

export function codeTelemetry(origin?: string, send: typeof fetch = fetch) {
  const visitId = randomUUID();
  const start = Date.now();
  const steps = new Set<string>();
  let completions = 0;
  return (input: unknown) => {
    const metric = codeMetricSchema.parse(input);
    if (!origin) return;
    if (metric.type === 'code_step') {
      if (steps.has(metric.step)) return;
      steps.add(metric.step);
    } else if (++completions > 50) return;
    const msSinceStart = Math.min(86_400_000, Math.max(0, Date.now() - start));
    void send(`${origin}/api/telemetry/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        visitId,
        flushMsSinceStart: msSinceStart,
        events: [
          {
            ...metric,
            ...(metric.type === 'code_completion' ? { latencyMs: Math.round(metric.latencyMs) } : {}),
            codeSurface: 'local_play',
            msSinceStart,
          },
        ],
      }),
      signal: AbortSignal.timeout(2000),
    }).catch(() => {});
  };
}
