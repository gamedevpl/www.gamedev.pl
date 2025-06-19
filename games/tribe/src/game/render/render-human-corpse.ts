import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { HUMAN_CORPSE_INITIAL_FOOD } from '../world-consts';

const CHARACTER_RADIUS = 30;
const MEAT_ICON = '🥩';
const MEAT_ICON_FONT_SIZE = 24;

/**
 * Renders a human corpse on the canvas.
 * @param ctx Canvas rendering context.
 * @param corpse The human corpse entity to render.
 */
export function renderHumanCorpse(ctx: CanvasRenderingContext2D, corpse: HumanCorpseEntity): void {
  const { position, gender, age, decayProgress, food } = corpse;

  // The corpse is rendered as an adult-sized character
  const currentCharacterRadius = CHARACTER_RADIUS;

  ctx.save();
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

  ctx.restore();

  // Render the meat icon if there is any meat left
  if (food.length > 0) {
    ctx.save();
    // Opacity is proportional to the amount of meat left
    ctx.globalAlpha = food.length / HUMAN_CORPSE_INITIAL_FOOD;
    ctx.font = `${MEAT_ICON_FONT_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(MEAT_ICON, position.x, position.y - currentCharacterRadius - MEAT_ICON_FONT_SIZE / 2);
    ctx.restore();
  }
}
