import { InteractionDefinition } from './interactions-types';
import { ArrowEntity } from '../entities/arrow/arrow-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { ARROW_BASE_DAMAGE, ARROW_COLLISION_RADIUS } from '../entities/arrow/arrow-consts';
import {
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
  HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
} from '../human-consts';
import { EFFECT_DURATION_SHORT_HOURS } from '../effect-consts';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from '../utils/math-utils';

/**
 * Interaction for arrows hitting humans.
 * Arrows deal damage, embed in target, and apply movement slowdown.
 * Friendly fire prevention: arrows don't hit the shooter.
 */
export const arrowHumanInteraction: InteractionDefinition<ArrowEntity, HumanEntity> = {
  id: 'arrow-human',
  sourceType: 'arrow',
  targetType: 'human',
  maxDistance: ARROW_COLLISION_RADIUS * 2,

  checker: (arrow, human, context) => {
    // Don't hit the shooter
    if (arrow.shooterId === human.id) {
      return false;
    }

    // Check for friendly fire - if shooter and target are in same tribe, don't hit
    const shooter = context.gameState.entities.entities[arrow.shooterId] as HumanEntity | undefined;
    if (shooter && shooter.leaderId && shooter.leaderId === human.leaderId) {
      return false;
    }

    return !!(
      !arrow.isEmbedded && // Arrow must be flying
      human.hitpoints > 0 && // Human must be alive
      arrow.vz <= human.radius // Arrow is at or below human height
    );
  },

  perform: (arrow, human, context) => {
    // Calculate damage (no modifier for humans)
    const damage = ARROW_BASE_DAMAGE;

    // Apply damage
    human.hitpoints -= damage;

    // Embed the arrow
    arrow.isEmbedded = true;
    arrow.embeddedTime = context.gameState.time;
    arrow.vx = 0;
    arrow.vy = 0;
    arrow.vz = 0;

    // Apply pushback force
    const pushDirection = getDirectionVectorOnTorus(
      arrow.position,
      human.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const pushForce = vectorScale(pushDirection, 3);
    human.forces.push(pushForce);

    // Add hit visual effect
    addVisualEffect(
      context.gameState,
      VisualEffectType.Hit,
      human.position,
      EFFECT_DURATION_SHORT_HOURS,
      human.id,
    );

    // Apply movement slowdown debuff
    human.movementSlowdown = {
      modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
      endTime: context.gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
    };

    // Play appropriate sound
    if (human.hitpoints <= 0) {
      playSoundAt(context, SoundType.HumanDeath, human.position);
    } else {
      playSoundAt(context, SoundType.Attack, human.position);
    }
  },
};
