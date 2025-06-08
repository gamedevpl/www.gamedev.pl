import { HumanEntity } from '../entities/characters/human/human-types';

import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';

const CHARACTER_RADIUS = 30;

type Stance = 'idle' | 'walk' | 'eat' | 'gathering' | 'procreate' | 'dead';

// Mapping from HumanEntity activeAction to render stance
const actionToStanceMap: Record<NonNullable<HumanEntity['activeAction']>, Stance> = {
  moving: 'walk',
  gathering: 'gathering',
  eating: 'eat',
  procreating: 'procreate',
  idle: 'idle',
};

/**
 * Renders a human character on the canvas
 * @param ctx Canvas rendering context
 * @param human The human entity to render
 */
export function renderCharacter(ctx: CanvasRenderingContext2D, human: HumanEntity): void {
  const { position, activeAction = 'idle' } = human;

  // Adjust character radius based on adult status
  const currentCharacterRadius = human.isAdult ? CHARACTER_RADIUS : CHARACTER_RADIUS * 0.6;

  const stance: Stance = actionToStanceMap[activeAction] || 'idle';

  TribeHuman2D.render(
    ctx,
    position.x - currentCharacterRadius,
    position.y - currentCharacterRadius,
    currentCharacterRadius * 2,
    currentCharacterRadius * 2,
    human.animationProgress || 0,
    stance,
    human.gender,
    human.age,
    [human.direction.x, human.direction.y],
    human.isPregnant ?? false,
    human.hunger,
  );
}
