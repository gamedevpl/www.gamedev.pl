import type {
  AssessmentSource,
  ModerationFlagAction,
  ModerationFlagReason,
  ModerationFlagStatus,
} from '@gamedevpl/contract';

// A reviewer reporting content, kept apart from the quality verdict.
export interface ModerationFlag {
  id: string;
  slug: string;
  source: AssessmentSource;
  reason: ModerationFlagReason;
  note: string;
  raisedByUid: string;
  gameVersion: string | null;
  createdAt: string;
  status: ModerationFlagStatus;
  resolvedAt: string | null;
  resolvedByUid: string | null;
  action: ModerationFlagAction | null;
  resolutionNote: string | null;
}

export const MODERATION_FLAGS_COLLECTION = 'moderationFlags';

// One open report per reviewer per game; re-raising reopens it.
export function moderationFlagId(slug: string, raisedByUid: string): string {
  return `${slug}:${raisedByUid}`;
}

export function hydrateModerationFlag(id: string, data: Omit<ModerationFlag, 'id'>): ModerationFlag {
  return {
    ...data,
    id,
    gameVersion: data.gameVersion ?? null,
    resolvedAt: data.resolvedAt ?? null,
    resolvedByUid: data.resolvedByUid ?? null,
    action: data.action ?? null,
    resolutionNote: data.resolutionNote ?? null,
  };
}
