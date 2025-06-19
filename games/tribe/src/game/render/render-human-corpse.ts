import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { CHARACTER_RADIUS, CORPSE_MEAT_ICON_SIZE, HUMAN_MAX_FOOD } from '../world-consts';
import { FOOD_TYPE_EMOJIS } from '../food/food-types';

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

  // Render the meat icons scattered around the corpse
  if (food.length > 0) {
    ctx.save();
    ctx.font = `${CORPSE_MEAT_ICON_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const scatterRadius = CHARACTER_RADIUS * 0.9; // Scatter icons just outside the corpse radius
    const angleStep = (Math.PI / HUMAN_MAX_FOOD) * 3;

    food.forEach((foodItem, i) => {
      const angle = i * angleStep;
      const x = position.x + scatterRadius * Math.cos(angle) * Math.atan2(i, i);
      const y = position.y + scatterRadius * Math.sin(angle) * Math.atan2(i, i);
      const emoji = FOOD_TYPE_EMOJIS[foodItem.type];
      ctx.fillText(emoji, x, y);
    });

    ctx.restore();
  }
}
