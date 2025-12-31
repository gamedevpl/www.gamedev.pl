import { CorpseEntity } from '../entities/characters/corpse-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';
import { TribePredator2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-predator-2d/tribe-predator-2d.js';
import { CHARACTER_RADIUS } from '../ui/ui-consts.js';
import { HUMAN_MAX_FOOD } from '../human-consts';
import { FOOD_TYPE_EMOJIS } from '../entities/food-types.js';
import { SpriteCache } from './sprite-cache';
import { snapToStep } from './render-utils';

const CORPSE_MEAT_ICON_SIZE = 9;

// Caching logic
const corpseCache = new SpriteCache(200);

/**
 * Renders a corpse on the canvas based on its original entity type.
 * @param ctx Canvas rendering context.
 * @param corpse The corpse entity to render.
 */
export function renderCorpse(ctx: CanvasRenderingContext2D, corpse: CorpseEntity): void {
  const { position, gender, age, decayProgress, food, radius, originalEntityType, geneCode } = corpse;

  // Discretize state for caching
  const decayStep = snapToStep(decayProgress, 20);
  const ageStep = Math.floor(age);
  const key = `${originalEntityType}_${gender}_${ageStep}_${decayStep}_${radius}_${geneCode || 0}`;
  const size = Math.ceil(radius * 2) + 4;

  const sprite = corpseCache.getOrRender(key, size, size, (cacheCtx) => {
    cacheCtx.translate(size / 2, size / 2);
    if (originalEntityType === 'human') {
      TribeHuman2D.render(
        cacheCtx,
        -size / 2 + 2,
        -size / 2 + 2,
        size - 4,
        size - 4,
        decayStep,
        'dead', // Stance
        gender,
        ageStep,
        [0, 0], // No direction
        false, // Not pregnant
        0, // No hunger
      );
    } else if (originalEntityType === 'prey') {
      TribePrey2D.render(
        cacheCtx,
        -size / 2 + 2,
        -size / 2 + 2,
        size - 4,
        size - 4,
        decayStep,
        'dead', // Stance
        {
          gender,
          age: ageStep,
          direction: [0, 0], // No direction
          isPregnant: false,
          hungryLevel: 0, // No hunger
          geneCode: geneCode || 0x804020,
        },
      );
    } else if (originalEntityType === 'predator') {
      TribePredator2D.render(
        cacheCtx,
        -size / 2 + 2,
        -size / 2 + 2,
        size - 4,
        size - 4,
        decayStep,
        'dead', // Stance
        {
          gender,
          age: ageStep,
          direction: [0, 0], // No direction
          isPregnant: false,
          hungryLevel: 0, // No hunger
          geneCode: geneCode || 0x804020,
        },
      );
    }
  });

  ctx.save();
  ctx.globalAlpha = 1 - decayProgress;
  ctx.drawImage(sprite, position.x - sprite.width / 2, position.y - sprite.height / 2);
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
