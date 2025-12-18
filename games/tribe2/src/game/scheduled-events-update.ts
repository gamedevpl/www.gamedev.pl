import { UpdateContext } from './world-types';
import { addVisualEffect } from './utils/visual-effects-utils';
import { VisualEffectType } from './visual-effects/visual-effect-types';
import { playSoundAt } from './sound/sound-manager';
import { SoundType } from './sound/sound-types';
import { getDirectionVectorOnTorus, vectorScale } from './utils/math-utils';
import { EFFECT_DURATION_SHORT_HOURS } from './effect-consts';
import { HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER, HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS } from './human-consts';
import { HumanEntity } from './entities/characters/human/human-types';
import { PredatorEntity } from './entities/characters/predator/predator-types';
import { PreyEntity } from './entities/characters/prey/prey-types';

export function scheduledEventsUpdate(context: UpdateContext): void {
  const { gameState } = context;
  const currentTime = gameState.time;

  // Split events into those to process and those to keep
  const eventsToProcess = gameState.scheduledEvents.filter((e) => e.scheduledTime <= currentTime);
  const remainingEvents = gameState.scheduledEvents.filter((e) => e.scheduledTime > currentTime);

  // Update state with remaining events
  gameState.scheduledEvents = remainingEvents;

  // Process due events
  for (const event of eventsToProcess) {
    switch (event.type) {
      case 'ranged-impact': {
        const target = gameState.entities.entities[event.data.targetId] as
          | HumanEntity
          | PredatorEntity
          | PreyEntity
          | undefined;

        // Skip if target is gone or already dead
        if (!target || target.hitpoints <= 0) {
          continue;
        }

        // 1. Apply Damage
        target.hitpoints -= event.data.damage;

        // 2. Apply Movement Slowdown (only if target supports it, which humans/predators/prey do via base Entity properties used in updates)
        // Note: movementSlowdown is currently defined on HumanEntity, PredatorEntity, and PreyEntity
        target.movementSlowdown = {
          modifier: HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER,
          endTime: gameState.time + HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS,
        };

        // 3. Apply Pushback Force
        const pushDirection = getDirectionVectorOnTorus(
          event.data.attackerPosition,
          target.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        const pushForce = vectorScale(pushDirection, event.data.pushbackForce);
        target.forces.push(pushForce);

        // 4. Visual Effect at Impact
        addVisualEffect(gameState, VisualEffectType.Hit, target.position, EFFECT_DURATION_SHORT_HOURS, target.id);

        // 5. Sound Effects
        if (target.hitpoints <= 0) {
          playSoundAt(context, SoundType.HumanDeath, target.position);
        } else {
          // Use impact sound (reusing Attack sound for now)
          playSoundAt(context, SoundType.Attack, target.position);
        }
        break;
      }
    }
  }
}
