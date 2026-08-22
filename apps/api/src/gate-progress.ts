/** Mid-gate milestones on the GCS version manifest. */
import {
  GATE_PROGRESS_LANES,
  GATE_PROGRESS_STAGES,
  type GateProgress,
  type GateProgressLane,
  type GateProgressStage,
} from '@gamedevpl/contract';

export { GATE_PROGRESS_LANES, GATE_PROGRESS_STAGES, type GateProgress, type GateProgressLane, type GateProgressStage };

const PREVIEW_STAGES: readonly GateProgressStage[] = [
  'preparing',
  'installing',
  'typecheck',
  'smoke',
  'build',
  'capture',
];

const PUBLISH_STAGES: readonly GateProgressStage[] = [
  'preparing',
  'installing',
  'typecheck',
  'smoke',
  'build',
  'trace',
  'capture',
  'validate',
  'accept',
  'agent-play',
  'agency',
  'playtest',
];

export function stagesForLane(lane: GateProgressLane): readonly GateProgressStage[] {
  return lane === 'preview' ? PREVIEW_STAGES : PUBLISH_STAGES;
}

export function isGateProgressStage(value: string): value is GateProgressStage {
  return (GATE_PROGRESS_STAGES as readonly string[]).includes(value);
}

export function gateProgressFor(
  lane: GateProgressLane,
  stage: GateProgressStage,
  at: string = new Date().toISOString(),
): GateProgress {
  const stages = stagesForLane(lane);
  const index = Math.max(0, stages.indexOf(stage));
  return { lane, stage, index, total: stages.length, at };
}

/** Parse `=== typecheck (slug) ===`. */
export function parseGateStageBanner(chunk: string): GateProgressStage | null {
  const match = /===\s+([a-z][a-z0-9-]*)\s+\(/i.exec(chunk);
  if (!match) return null;
  const name = match[1]!.toLowerCase();
  return isGateProgressStage(name) ? name : null;
}

/** Stream parser; complete banners only. */
export function createGateStageBannerParser(onStage: (stage: GateProgressStage) => void): (chunk: string) => void {
  let buf = '';
  let last: GateProgressStage | null = null;
  return (chunk: string) => {
    buf += chunk;
    const re = /===\s+([a-z][a-z0-9-]*)\s+\([^)]*\)\s*===/gi;
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = re.exec(buf)) !== null) {
      consumed = match.index + match[0].length;
      const name = match[1]!.toLowerCase();
      if (!isGateProgressStage(name) || name === last) continue;
      if (name === 'preparing' || name === 'installing') continue;
      last = name;
      onStage(name);
    }
    buf = buf.slice(consumed);
    if (buf.length > 120) buf = buf.slice(-120);
  };
}

/** Short checklist index (−1 = setup). */
export function gateProgressChecklistIndex(stage: GateProgressStage, lane: GateProgressLane): number {
  const checklist: readonly string[] =
    lane === 'preview'
      ? ['typecheck', 'smoke', 'build']
      : ['typecheck', 'smoke', 'build', 'trace', 'capture', 'validate'];
  if (stage === 'preparing' || stage === 'installing') return -1;
  const latePublish = stage === 'accept' || stage === 'agent-play' || stage === 'agency' || stage === 'playtest';
  if (latePublish && lane !== 'preview') return checklist.indexOf('validate');
  return checklist.indexOf(stage);
}
