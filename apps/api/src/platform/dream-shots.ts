// Reserved captions and studio wording shared by every proposal writer.

// The real gate frame a proposal was drawn from.
export const DREAM_SOURCE_SHOT_LABEL = 'Dream source';

// An AI-edited concept frame; the studio must always say so.
export const DREAM_FRAME_SHOT_LABEL = 'AI concept';

// Both reserved captions, for store reads that must skip proposal shots.
export const DREAM_SHOT_LABELS: readonly string[] = [DREAM_SOURCE_SHOT_LABEL, DREAM_FRAME_SHOT_LABEL];

// True for shots that belong to a proposal, not the media strip.
export function isDreamShotLabel(label: string | undefined): boolean {
  return DREAM_SHOT_LABELS.includes(label ?? '');
}

// The studio's own line above the frames, whoever drew them.
export const PROPOSAL_TEXT_EN = 'I sketched two directions for the next round. Tap one to see it.';
export const PROPOSAL_TEXT_PL = 'Naszkicowałem dwa kierunki na następną rundę. Kliknij, żeby zobaczyć.';

// One concept frame; Firestore holds it base64 in one document.
export const MAX_PROPOSAL_FRAME_BYTES = 600 * 1024;
