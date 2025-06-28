import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findNearbyEnemiesOfTribe, countTribeAttackersOnTarget } from '../../utils/world-utils';
import {
  AI_FLEE_HEALTH_THRESHOLD,
  AI_TRIBE_BATTLE_RADIUS,
  EFFECT_DURATION_SHORT_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING,
  MAX_TRIBE_ATTACKERS_PER_TARGET,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { addVisualEffect } from '../../utils/visual-effects-utils';
import { VisualEffectType } from '../../visual-effects/visual-effect-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { calculateWrappedDistance } from '../../utils/math-utils';

export class TribeBattleStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    // 1. Basic conditions for the human to be able to join a battle.
    if (
      !human.isAdult ||
      !human.leaderId ||
      human.id === human.leaderId ||
      human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING ||
      human.hitpoints < human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD
    ) {
      return null;
    }

    // 2. Get the leader and check if they are calling to attack.
    const leader = gameState.entities.entities.get(human.leaderId) as HumanEntity | undefined;
    if (!leader || !leader.isCallingToAttack) {
      // Leader is not calling for an attack.
      return null;
    }

    // 3. Find enemies near the leader.
    const enemies = findNearbyEnemiesOfTribe(
      leader.position, // Use leader's position as the center
      leader.id,
      gameState as IndexedWorldState,
      AI_TRIBE_BATTLE_RADIUS,
    );

    if (enemies.length === 0) {
      return null;
    }

    // 4. Sort enemies by distance to the current human (not the leader).
    enemies.sort((a, b) => {
      const distA = calculateWrappedDistance(
        human.position,
        a.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      const distB = calculateWrappedDistance(
        human.position,
        b.position,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );
      return distA - distB;
    });

    // 5. Find the best target (closest one with fewest attackers).
    for (const enemy of enemies) {
      const attackersCount = countTribeAttackersOnTarget(leader.id, enemy.id, gameState as IndexedWorldState);
      if (attackersCount < MAX_TRIBE_ATTACKERS_PER_TARGET) {
        return enemy; // Found a suitable target.
      }
    }

    // 6. No suitable target found.
    return null;
  }

  execute(human: HumanEntity, context: UpdateContext, target: HumanEntity): void {
    // Add a visual effect to show that a target has been acquired.
    if (
      !human.lastTargetAcquiredEffectTime ||
      context.gameState.time - human.lastTargetAcquiredEffectTime > EFFECT_DURATION_SHORT_HOURS * 5
    ) {
      addVisualEffect(
        context.gameState,
        VisualEffectType.TargetAcquired,
        human.position,
        EFFECT_DURATION_SHORT_HOURS,
        human.id,
      );
      human.lastTargetAcquiredEffectTime = context.gameState.time;
    }

    // Set the human's action to attack the target.
    human.activeAction = 'attacking';
    human.attackTargetId = target.id;
    human.targetPosition = undefined; // Clear any previous movement target.
  }
}
