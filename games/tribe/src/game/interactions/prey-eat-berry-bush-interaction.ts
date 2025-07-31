import { InteractionDefinition } from './interactions-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import {
  PREY_INTERACTION_RANGE,
  PREY_EATING_COOLDOWN_HOURS,
  PREY_BERRY_BUSH_DAMAGE,
  EFFECT_DURATION_SHORT_HOURS,
} from '../world-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';

/**
 * Interaction for prey consuming berry bushes.
 * Prey eat from berry bushes when hungry, reducing the bush's lifetime.
 */
export const preyEatBerryBushInteraction: InteractionDefinition<PreyEntity, BerryBushEntity> = {
  id: 'prey-eat-berry-bush',
  sourceType: 'prey',
  targetType: 'berryBush',
  maxDistance: PREY_INTERACTION_RANGE,

  checker: (prey, berryBush, context) => {
    return !!(
      prey.isAdult &&
      berryBush.food.length > 0 &&
      prey.hunger > 30 && // Only eat when moderately hungry
      (!prey.eatingCooldownTime || prey.eatingCooldownTime < context.gameState.time)
    );
  },

  perform: (prey, berryBush, context) => {
    // Consume food from the berry bush
    const food = berryBush.food.pop();
    if (food) {
      // Reduce prey hunger
      prey.hunger = Math.max(0, prey.hunger - 25);
      
      // Damage the berry bush by reducing its lifespan
      berryBush.lifespan -= PREY_BERRY_BUSH_DAMAGE;
      berryBush.timeSinceLastHarvest = context.gameState.time;

      // Set eating cooldown
      prey.eatingCooldownTime = context.gameState.time + PREY_EATING_COOLDOWN_HOURS;

      // Add visual effect
      addVisualEffect(
        context.gameState,
        VisualEffectType.BushClaimed, // Reuse existing effect
        berryBush.position,
        EFFECT_DURATION_SHORT_HOURS,
        prey.id,
      );

      // Play sound
      playSoundAt(context, SoundType.Gather, prey.position);
    }
  },
};