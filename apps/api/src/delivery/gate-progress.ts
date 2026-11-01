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

const PUBLISH_STAGES: readonly GateProgressStage[] = GATE_PROGRESS_STAGES;

export function stagesForLane(lane: GateProgressLane): readonly GateProgressStage[] {
  return lane === 'preview' ? PREVIEW_STAGES : PUBLISH_STAGES;
}

export function isGateProgressStage(value: string): value is GateProgressStage {
  return (GATE_PROGRESS_STAGES as readonly string[]).includes(value);
}

export function normalizeGateStageName(raw: string): GateProgressStage | null {
  const name = raw.toLowerCase();
  if (name === 'test:game') return 'trace';
  if (name === 'shot') return 'playtest';
  return isGateProgressStage(name) ? name : null;
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
  const match = /(?:===\s+([a-z][a-z0-9:-]*)\s+\(|(?:^|\n)start\s+([a-z][a-z0-9:-]*)\s+\()/i.exec(chunk);
  if (!match) return null;
  return normalizeGateStageName((match[1] ?? match[2])!);
}

/** Stream parser; complete banners only. */
export function createGateStageBannerParser(onStage: (stage: GateProgressStage) => void): (chunk: string) => void {
  let buf = '';
  let lastIndex = -1;
  return (chunk: string) => {
    buf += chunk;
    const re =
      /(?:===\s+([a-z][a-z0-9:-]*)\s+\([^)\n]*\)[^=\n]*===|(?:^|\n)start\s+([a-z][a-z0-9:-]*)\s+\([^)\n]*\))/gi;
    let match: RegExpExecArray | null;
    let consumed = 0;
    while ((match = re.exec(buf)) !== null) {
      consumed = match.index + match[0].length;
      const stage = normalizeGateStageName((match[1] ?? match[2])!);
      if (!stage || stage === 'preparing' || stage === 'installing') continue;
      const idx = PUBLISH_STAGES.indexOf(stage);
      if (idx <= lastIndex) continue;
      lastIndex = idx;
      onStage(stage);
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
