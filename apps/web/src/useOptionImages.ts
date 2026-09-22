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

// A refine returns zero, one or two visual questions.
export function useOptionImages(questions: OptionImageQuestion[], concept: string): OptionImageMap {
  const [images, setImages] = useState<OptionImageMap>({});

  // Keyed on ids so a re-render does not refetch.
  const visualIds = questions
    .filter((question) => question.visual && question.options.length > 0)
    .map((question) => question.id)
    .join('|');

  useEffect(() => {
    if (!visualIds) return;
    const controller = new AbortController();
    const wanted = questions.filter((question) => visualIds.split('|').includes(question.id));

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
        .catch(() => undefined);
    }

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualIds, concept]);

  return images;
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
