import { CorpseEntity } from '../entities/characters/corpse-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';
import { TribePredator2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-predator-2d/tribe-predator-2d.js';
import { CHARACTER_RADIUS } from '../ui/ui-consts.js';
import { HUMAN_MAX_FOOD } from '../human-consts';
import { FOOD_TYPE_EMOJIS } from '../food/food-types';

const CORPSE_MEAT_ICON_SIZE = 9;

/**
 * Renders a corpse on the canvas based on its original entity type.
 * @param ctx Canvas rendering context.
 * @param corpse The corpse entity to render.
 */
export function renderCorpse(ctx: CanvasRenderingContext2D, corpse: CorpseEntity): void {
  const { position, gender, age, decayProgress, food, radius, originalEntityType, geneCode } = corpse;

  ctx.save();
  ctx.globalAlpha = 1 - decayProgress;

  // Render based on original entity type
  if (originalEntityType === 'human') {
    TribeHuman2D.render(
      ctx,
      position.x - radius,
      position.y - radius,
      radius * 2,
      radius * 2,
      decayProgress,
      'dead', // Stance
      gender,
      age,
      [0, 0], // No direction
      false, // Not pregnant
      0, // No hunger
    );
  } else if (originalEntityType === 'prey') {
    TribePrey2D.render(
      ctx,
      position.x - radius,
      position.y - radius,
      radius * 2,
      radius * 2,
      decayProgress,
      'dead', // Stance
      {
        gender,
        age,
        direction: [0, 0], // No direction
        isPregnant: false,
        hungryLevel: 0, // No hunger
        geneCode: geneCode || 0x804020,
      },
    );
  } else if (originalEntityType === 'predator') {
    TribePredator2D.render(
      ctx,
      position.x - radius,
      position.y - radius,
      radius * 2,
      radius * 2,
      decayProgress,
      'dead', // Stance
      {
        gender,
        age,
        direction: [0, 0], // No direction
        isPregnant: false,
        hungryLevel: 0, // No hunger
        geneCode: geneCode || 0x804020,
      },
    );
  }

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
