// The gate verdict vocabulary — one declaration for every place that names it.
export const GATE_STATUS_VALUES = ['green', 'kit_outdated', 'preview_passed', 'preview_failed', 'red'] as const;

export type GateStatus = (typeof GATE_STATUS_VALUES)[number];

// Same vocabulary the gate route replies with.
export function deriveGateStatusString(gate: {
  green: boolean;
  status?: 'kit_outdated' | 'preview_passed' | 'preview_failed';
}): GateStatus {
  if (gate.green) return 'green';
  if (gate.status === 'kit_outdated') return 'kit_outdated';
  if (gate.status === 'preview_passed') return 'preview_passed';
  if (gate.status === 'preview_failed') return 'preview_failed';
  return 'red';
}

// The preview lane's own status — its green is not publish green.
export function derivePreviewGateStatus(preview: {
  green: boolean;
  status?: 'kit_outdated';
}): Extract<GateStatus, 'kit_outdated' | 'preview_passed' | 'preview_failed'> {
  if (preview.status === 'kit_outdated') return 'kit_outdated';
  return preview.green ? 'preview_passed' : 'preview_failed';
}
