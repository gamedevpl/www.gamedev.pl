// Creator Kit capture-plan.ts @ f2b18945a50560f6b269b1296f4ca3781f473430; provenance: docs/cli-capture-isolation.md.
export const CONDITION_OPERATORS = Object.freeze([
  'equals',
  'notEquals',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'oneOf',
]);

export type SnapshotValue = string | number | boolean | null;
export type Snapshot = Record<string, SnapshotValue>;

export interface PlanCondition {
  field: string;
  equals?: SnapshotValue;
  notEquals?: SnapshotValue;
  greaterThan?: number;
  greaterThanOrEqual?: number;
  lessThan?: number;
  lessThanOrEqual?: number;
  oneOf?: SnapshotValue[];
  maxFrames?: number;
}

export interface PlanPointer {
  x?: number;
  y?: number;
  fromMetadata?: { x: string; y: string };
}

export interface PlanDrag {
  from: PlanPointer;
  to: PlanPointer;
  frames: number;
}

export interface ResolvedPlanPointer {
  x: number;
  y: number;
}

export type PlanAction =
  | { capture: string }
  | { wait: number }
  | { tap: string | { key: string; code?: string } }
  | { press: { key: string; code?: string; frames: number } }
  | { keyDown: string | { key: string; code?: string } }
  | { keyUp: string | { key: string; code?: string } }
  | { click: PlanPointer }
  | { move: PlanPointer }
  | { drag: PlanDrag }
  | { assert: PlanCondition }
  | { waitFor: PlanCondition }
  | { repeat: { times: number; actions: PlanAction[] } };

export interface CapturePlan {
  seed: number;
  fps: number;
  maxFrames: number;
  script: PlanAction[];
}

export function evaluateCondition(snapshot: Snapshot | undefined, condition: PlanCondition): boolean {
  const actual = snapshot?.[condition.field];
  if ('equals' in condition) return actual === condition.equals;
  if ('notEquals' in condition) return actual !== condition.notEquals;
  if ('greaterThan' in condition) return typeof actual === 'number' && actual > (condition.greaterThan as number);
  if ('greaterThanOrEqual' in condition)
    return typeof actual === 'number' && actual >= (condition.greaterThanOrEqual as number);
  if ('lessThan' in condition) return typeof actual === 'number' && actual < (condition.lessThan as number);
  if ('lessThanOrEqual' in condition)
    return typeof actual === 'number' && actual <= (condition.lessThanOrEqual as number);
  if ('oneOf' in condition) return (condition.oneOf as SnapshotValue[]).includes(actual as SnapshotValue);
  return false;
}

export function conditionLabel(condition: PlanCondition): string {
  const operator = CONDITION_OPERATORS.find((name) => name in condition);
  if (!operator) return `${condition.field} has no comparison operator`;
  return `${condition.field} ${operator} ${JSON.stringify((condition as unknown as Record<string, unknown>)[operator])}`;
}

export interface PlanDriver {
  step(frame: number): Promise<void> | void;
  key(type: 'keydown' | 'keyup', key: string, code?: string): Promise<void> | void;
  resolvePointer(target: PlanPointer): Promise<ResolvedPlanPointer> | ResolvedPlanPointer;
  pointer(
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    target: ResolvedPlanPointer,
    buttons: 0 | 1,
    synthesizeClick?: boolean,
  ): Promise<void> | void;
  snapshot(): Promise<Snapshot> | Snapshot;
  mark(name: string, frame: number): Promise<void> | void;
}

export function interpolatePointer(
  from: ResolvedPlanPointer,
  to: ResolvedPlanPointer,
  progress: number,
): ResolvedPlanPointer {
  return {
    x: Number(from.x) + (Number(to.x) - Number(from.x)) * progress,
    y: Number(from.y) + (Number(to.y) - Number(from.y)) * progress,
  };
}

export async function runCapturePlan(plan: CapturePlan, driver: PlanDriver): Promise<{ frames: number }> {
  let frame = 0;

  async function advance(count: number) {
    for (let index = 0; index < count; index++) {
      if (frame >= plan.maxFrames) throw new Error(`Capture script exceeded maxFrames (${plan.maxFrames})`);
      frame += 1;
      await driver.step(frame);
    }
  }

  async function runActions(actions: PlanAction[]) {
    for (const action of actions) {
      if ('capture' in action) {
        await driver.mark(action.capture, frame);
      } else if ('wait' in action) {
        await advance(action.wait);
      } else if ('tap' in action) {
        const tap = typeof action.tap === 'string' ? { key: action.tap } : action.tap;
        await driver.key('keydown', tap.key, tap.code);
        await advance(1);
        await driver.key('keyup', tap.key, tap.code);
      } else if ('keyDown' in action) {
        const held = typeof action.keyDown === 'string' ? { key: action.keyDown } : action.keyDown;
        await driver.key('keydown', held.key, held.code);
      } else if ('keyUp' in action) {
        const held = typeof action.keyUp === 'string' ? { key: action.keyUp } : action.keyUp;
        await driver.key('keyup', held.key, held.code);
      } else if ('press' in action) {
        await driver.key('keydown', action.press.key, action.press.code);
        await advance(action.press.frames);
        await driver.key('keyup', action.press.key, action.press.code);
      } else if ('click' in action) {
        const target = await driver.resolvePointer(action.click);
        await driver.pointer('pointerdown', target, 1, true);
        await driver.pointer('pointerup', target, 0);
        await advance(1);
      } else if ('move' in action) {
        await driver.pointer('pointermove', await driver.resolvePointer(action.move), 0);
      } else if ('drag' in action) {
        const from = await driver.resolvePointer(action.drag.from);
        const to = await driver.resolvePointer(action.drag.to);
        await driver.pointer('pointerdown', from, 1);
        for (let index = 1; index <= action.drag.frames; index++) {
          const target = interpolatePointer(from, to, index / action.drag.frames);
          await driver.pointer('pointermove', target, 1);
          await advance(1);
        }
        await driver.pointer('pointerup', to, 0);
      } else if ('assert' in action) {
        const snapshot = await driver.snapshot();
        if (!evaluateCondition(snapshot, action.assert)) {
          throw new Error(
            `assertion failed at frame ${frame}: ${conditionLabel(action.assert)}; snapshot=${JSON.stringify(snapshot)}`,
          );
        }
      } else if ('waitFor' in action) {
        let matched = false;
        for (let attempt = 0; attempt < action.waitFor.maxFrames!; attempt++) {
          if (evaluateCondition(await driver.snapshot(), action.waitFor)) {
            matched = true;
            break;
          }
          await advance(1);
        }
        if (!matched) throw new Error(`waitFor timed out at frame ${frame}: ${conditionLabel(action.waitFor)}`);
      } else if ('repeat' in action) {
        for (let index = 0; index < action.repeat.times; index++) await runActions(action.repeat.actions);
      }
    }
  }

  await runActions(plan.script);
  return { frames: frame };
}
