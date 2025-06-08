import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';

const CHARACTER_RADIUS = 30;

/**
 * Renders a human corpse on the canvas.
 * @param ctx Canvas rendering context.
 * @param corpse The human corpse entity to render.
 */
export function renderHumanCorpse(ctx: CanvasRenderingContext2D, corpse: HumanCorpseEntity): void {
  const { position, gender, age, decayProgress } = corpse;

  // The corpse is rendered as an adult-sized character
  const currentCharacterRadius = CHARACTER_RADIUS;

  ctx.globalAlpha = 1 - decayProgress;

  TribeHuman2D.render(
    ctx,
    position.x - currentCharacterRadius,
    position.y - currentCharacterRadius,
    currentCharacterRadius * 2,
    currentCharacterRadius * 2,
    decayProgress,
    'dead', // Stance
    gender,
    age,
    [0, 0], // No direction
    false, // Not pregnant
    0, // No hunger
  );

  ctx.globalAlpha = 1;
}
