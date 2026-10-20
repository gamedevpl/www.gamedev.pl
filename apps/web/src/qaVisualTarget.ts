import { MAX_CONCEPT_LENGTH } from './conceptLength.js';
import { pickQuestionArt, type OptionImageMap } from './useOptionImages.js';

// The API keeps four reference images and drops the rest silently.
export const MAX_REFERENCE_IMAGES = 4;

// The tile the creator picked on a visual question.
export interface QaVisualTarget {
  question: string;
  label: string;
  dataUrl: string;
}

interface VisualQuestion {
  id: string;
  question: string;
  options: Array<{ label: string }>;
}

// The first illustrated question with an illustrated pick; one tile is enough.
export function pickVisualTarget(
  questions: VisualQuestion[],
  images: OptionImageMap,
  selected: Record<string, string[]>,
): QaVisualTarget | undefined {
  for (const question of questions) {
    const art = pickQuestionArt(images, question);
    if (!art) continue;
    const label = (selected[question.id] ?? []).find((pick) => art[pick]);
    if (label) return { question: question.question, label, dataUrl: art[label]! };
  }
  return undefined;
}

// Otherwise the agent takes the tile for an upload.
export function visualTargetNote(target: QaVisualTarget): string {
  const question = target.question.replace(/\?$/, '');
  return (
    `## Visual target\nThe newest reference image is the illustration the creator picked for ` +
    `"${question}" (answer: ${target.label}). Treat it as the look to aim for, not a screenshot to copy.`
  );
}

// The tile goes last; the creator's own images keep their slots.
export async function attachVisualTarget(
  concept: string,
  referenceImages: string[] | undefined,
  target: QaVisualTarget | undefined,
  toPng: (dataUrl: string) => Promise<string | null>,
): Promise<{ concept: string; referenceImages: string[] | undefined }> {
  const own = referenceImages ?? [];
  if (!target || own.length >= MAX_REFERENCE_IMAGES) return { concept, referenceImages };
  // No room for the label means no tile.
  const labelled = `${concept.trim()}\n\n${visualTargetNote(target)}`;
  if (labelled.length > MAX_CONCEPT_LENGTH) return { concept, referenceImages };
  const png = await toPng(target.dataUrl);
  if (!png) return { concept, referenceImages };
  return { concept: labelled, referenceImages: [...own, png] };
}
