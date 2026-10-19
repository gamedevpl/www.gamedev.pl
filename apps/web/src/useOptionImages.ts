// Tiles for a refine's visual questions, fetched during reading.

import { useEffect, useState } from 'react';
import { fetchOptionImages } from './optionImagesApi.js';

export interface OptionImageQuestion {
  id: string;
  question: string;
  options: Array<{ label: string; detail?: string }>;
  visual?: boolean;
}

// Question id, then option label, then the tile's data URI.
export type OptionImageMap = Record<string, Record<string, string>>;

export interface OptionImageState {
  images: OptionImageMap;
  // Visual questions whose tiles are still on their way.
  loading: ReadonlySet<string>;
}

// The wizard holds a visual question at most this long.
export const TILE_WAIT_MS = 30_000;

function visualIdsOf(questions: OptionImageQuestion[]): string {
  return questions
    .filter((question) => question.visual && question.options.length > 0)
    .map((question) => question.id)
    .join('|');
}

// A refine returns zero, one or two visual questions.
export function useOptionImages(questions: OptionImageQuestion[], concept: string): OptionImageState {
  const [images, setImages] = useState<OptionImageMap>({});

  // Keyed on ids so a re-render does not refetch.
  const visualIds = visualIdsOf(questions);

  // Seeded loading, so a visual question never opens unheld.
  const [loading, setLoading] = useState<ReadonlySet<string>>(() => new Set(visualIds ? visualIds.split('|') : []));

  useEffect(() => {
    if (!visualIds) return;
    const controller = new AbortController();
    const wanted = questions.filter((question) => visualIds.split('|').includes(question.id));
    setLoading(new Set(wanted.map((question) => question.id)));

    const settle = (id: string) =>
      setLoading((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

    // Late tiles still land; the wizard just stops waiting.
    const giveUp = setTimeout(() => setLoading(new Set()), TILE_WAIT_MS);

    // Started on mount: generation finishes before the creator arrives.
    for (const question of wanted) {
      void fetchOptionImages({ concept, question: question.question, options: question.options }, controller.signal)
        .then((tiles) => {
          if (controller.signal.aborted || tiles.length === 0) return;
          setImages((prev) => ({
            ...prev,
            [question.id]: Object.fromEntries(tiles.map((tile) => [tile.label, tile.image])),
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) settle(question.id);
        });
    }

    return () => {
      controller.abort();
      clearTimeout(giveUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualIds, concept]);

  return { images, loading };
}

// All or nothing: illustrating a subset would make those options look preferred.
export function pickQuestionArt(
  images: OptionImageMap,
  question: { id: string; options: Array<{ label: string }> },
): Record<string, string> | undefined {
  const tiles = images[question.id];
  if (!tiles) return undefined;
  return question.options.every((option) => tiles[option.label]) ? tiles : undefined;
}
