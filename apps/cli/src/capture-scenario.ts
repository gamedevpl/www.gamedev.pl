import { z } from 'zod';
import { createHash } from 'node:crypto';
import { openSync, readSync, fstatSync, closeSync, constants } from 'node:fs';
import { gameSourcePath } from './source-project.js';
import { kitPath } from './kit-install.js';
import type { CapturePlan, PlanAction } from './capture-plan-runtime.js';

export const MAX_CAPTURE_PLAN_BYTES = 2 * 1024 * 1024;
const FILE_ACTIONS = 20_000;
const INLINE_ACTIONS = 2000;
const text = z.string().min(1).max(128);
const frames = z.number().int().min(1).max(36_000);
const key = z.union([text, z.object({ key: text, code: text.optional() }).strict()]);
const pointer = z.union([
  z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
  z.object({ fromMetadata: z.object({ x: text, y: text }).strict() }).strict(),
]);
const scalar = z.union([z.string().max(256), z.number().finite(), z.boolean(), z.null()]);
const operators = {
  equals: scalar.optional(),
  notEquals: scalar.optional(),
  greaterThan: z.number().finite().optional(),
  greaterThanOrEqual: z.number().finite().optional(),
  lessThan: z.number().finite().optional(),
  lessThanOrEqual: z.number().finite().optional(),
  oneOf: z.array(scalar).min(1).max(32).optional(),
};
const condition = z
  .object({ field: text, ...operators, maxFrames: frames.optional() })
  .strict()
  .refine(
    (value) => Object.keys(operators).filter((name) => value[name as keyof typeof value] !== undefined).length === 1,
    'A condition needs exactly one comparison operator.',
  );
const action: z.ZodType<PlanAction> = z.lazy(() =>
  z.union([
    z.object({ capture: text }).strict(),
    z.object({ wait: z.number().int().min(0).max(36_000) }).strict(),
    z.object({ tap: key }).strict(),
    z.object({ keyDown: key }).strict(),
    z.object({ keyUp: key }).strict(),
    z.object({ press: z.object({ key: text, code: text.optional(), frames }).strict() }).strict(),
    z.object({ click: pointer }).strict(),
    z.object({ move: pointer }).strict(),
    z.object({ drag: z.object({ from: pointer, to: pointer, frames }).strict() }).strict(),
    z.object({ assert: condition }).strict(),
    z
      .object({ waitFor: condition.refine((value) => value.maxFrames !== undefined, 'waitFor needs maxFrames.') })
      .strict(),
    z
      .object({
        repeat: z
          .object({ times: z.number().int().min(1).max(500), actions: z.array(action).min(1).max(FILE_ACTIONS) })
          .strict(),
      })
      .strict(),
  ]),
);

export const scenarioSchema = z
  .object({
    seed: z.number().int().min(0).max(0xffff_ffff).default(1),
    fps: z.number().int().min(1).max(60).default(30),
    maxFrames: frames.default(3600),
    script: z.array(action).min(1).max(FILE_ACTIONS),
  })
  .strict();

// Bound recursion before the recursive schema sees untrusted JSON.
function bound(value: unknown, depth = 0, budget = { left: 20_000 }): void {
  if (--budget.left < 0 || depth > 20) throw new Error('Capture plan is too large or deeply nested.');
  if (value && typeof value === 'object') for (const child of Object.values(value)) bound(child, depth + 1, budget);
}

export function parseScenario(raw: unknown, maxActions = INLINE_ACTIONS): CapturePlan {
  bound(raw, 0, { left: maxActions * 12 });
  const result = scenarioSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid capture plan: ${result.error.issues[0]?.message}`);
  const plan = result.data;
  if (plan.maxFrames > plan.fps * 600) throw new Error('Capture plan exceeds 600 seconds of simulated play.');
  let expanded = 0;
  const count = (actions: PlanAction[], factor = 1): void => {
    for (const entry of actions) {
      expanded += factor;
      if (expanded > maxActions) throw new Error(`Capture plan expands past ${maxActions} actions.`);
      if ('repeat' in entry) count(entry.repeat.actions, factor * entry.repeat.times);
    }
  };
  count(plan.script);
  return plan;
}

export type CaptureScenario = { plan: CapturePlan; mark?: string; source: 'CAPTURE.json' | 'inline'; hash: string };

export function selectScenario(args: Record<string, unknown>, readPlan?: () => unknown): CaptureScenario | undefined {
  if (args.mark === undefined && args.plan === undefined) return undefined;
  if (args.mark !== undefined && !text.safeParse(args.mark).success) throw new Error('Invalid capture mark.');
  const mark = args.mark as string | undefined;
  let raw = args.plan;
  if (raw === undefined) {
    if (!readPlan) throw new Error('CAPTURE.json is unavailable for this task. Supply an inline plan.');
    const stored = readPlan();
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Invalid CAPTURE.json.');
    // Media-only options are irrelevant to a single screenshot.
    const { seed, fps, maxFrames, script } = stored as Record<string, unknown>;
    raw = { seed, fps, maxFrames, script };
  }
  const plan = parseScenario(raw, args.plan === undefined ? FILE_ACTIONS : INLINE_ACTIONS);
  const names: string[] = [];
  const scan = (actions: PlanAction[]): void => {
    for (const entry of actions) {
      if ('capture' in entry) names.push(entry.capture);
      if ('repeat' in entry) scan(entry.repeat.actions);
    }
  };
  scan(plan.script);
  if (mark && !names.includes(mark))
    throw new Error(
      `Unknown capture mark ${JSON.stringify(mark)}. Available: ${names.join(', ') || '(none)'}. Supply an inline plan for a custom view.`,
    );
  const source = args.plan === undefined ? 'CAPTURE.json' : 'inline';
  const hash = createHash('sha256').update(JSON.stringify({ plan, mark })).digest('hex');
  return { plan, mark, source, hash };
}

export function readGameCapturePlan(root: string, slug: string): unknown {
  const file = kitPath(root, `${gameSourcePath(root, slug)}/CAPTURE.json`);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_CAPTURE_PLAN_BYTES)
      throw new Error('CAPTURE.json must be a regular file under 2 MiB.');
    const bytes = Buffer.alloc(MAX_CAPTURE_PLAN_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, size);
      if (!count) break;
      size += count;
    }
    if (size > MAX_CAPTURE_PLAN_BYTES) throw new Error('CAPTURE.json exceeds 2 MiB.');
    return JSON.parse(bytes.subarray(0, size).toString('utf8')) as unknown;
  } finally {
    closeSync(fd);
  }
}
