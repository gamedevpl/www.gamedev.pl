import { InteractionDefinition } from './interactions-types';
import { ArrowEntity } from '../entities/arrow/arrow-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { ARROW_BASE_DAMAGE, ARROW_COLLISION_RADIUS } from '../entities/arrow/arrow-consts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';

/**
 * Interaction for arrows hitting prey.
 * Arrows deal damage and embed in the target.
 */
export const arrowPreyInteraction: InteractionDefinition<ArrowEntity, PreyEntity> = {
  id: 'arrow-prey',
  sourceType: 'arrow',
  targetType: 'prey',
  maxDistance: ARROW_COLLISION_RADIUS * 2,

  checker: (arrow, prey) => {
    return !!(
      !arrow.isEmbedded && // Arrow must be flying
      prey.hitpoints > 0 && // Prey must be alive
      arrow.vz <= prey.radius // Arrow is at or below prey height
    );
  },

  perform: (arrow, prey, context) => {
    // Calculate damage (10% more effective than melee)
    const damage = ARROW_BASE_DAMAGE * 1.1;

    // Apply damage
    prey.hitpoints -= damage;

    // Embed the arrow
    arrow.isEmbedded = true;
    arrow.embeddedTime = context.gameState.time;
    arrow.vx = 0;
    arrow.vy = 0;
    arrow.vz = 0;

    // Apply small pushback to prey
    const pushDirection = getDirectionVectorOnTorus(
      arrow.position,
      prey.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 3);
    prey.forces.push(pushForce);

    // Add hit visual effect
    addVisualEffect(
      context.gameState,
      VisualEffectType.Hit,
      prey.position,
      EFFECT_DURATION_SHORT_HOURS,
      prey.id,
    );

    // Play appropriate sound
    if (prey.hitpoints <= 0) {
      playSoundAt(context, SoundType.HumanDeath, prey.position);
      // Set flee cooldown so prey behavior knows it's dead
      prey.fleeCooldown = 8;
    } else {
      playSoundAt(context, SoundType.Attack, prey.position);
      // Make prey flee
      prey.fleeCooldown = 8;
    }
  },
};
