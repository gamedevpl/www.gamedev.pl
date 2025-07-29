import { TRIBE_BADGE_EMOJIS } from '../world-consts';

let emojiIndex = 0;

/**
 * Generates a unique tribe badge emoji.
 */
export function generateTribeBadge(): string {
  const badge = TRIBE_BADGE_EMOJIS[emojiIndex];
  emojiIndex = (emojiIndex + 1) % TRIBE_BADGE_EMOJIS.length;
  return badge;
}
