import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import {
  calculateHabitabilityScore,
  findBestHabitat,
  calculateTribeStrength,
  isTribeUnderAttack,
  getTribeForLeader,
} from '../../utils/world-utils';
import {
  LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD,
  LEADER_META_STRATEGY_COOLDOWN_HOURS,
  LEADER_MIGRATION_SUPERIORITY_THRESHOLD,
  LEADER_WORLD_ANALYSIS_GRID_SIZE,
  LEADER_WORLD_ANALYSIS_GRID_STEP,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { Vector2D } from '../../utils/math-types';
import { EntityId } from '../../entities/entities-types';

enum LeaderDecision {
  MIGRATE_TO_SAFER_HABITAT,
  MIGRATE_TO_BETTER_HABITAT,
  ATTACK_WEAKER_TRIBE_FOR_HABITAT,
  CALL_TO_ATTACK_FOR_DEFENSE,
}

type LeaderStrategyCheckResult =
  | {
      decision: LeaderDecision.MIGRATE_TO_SAFER_HABITAT | LeaderDecision.MIGRATE_TO_BETTER_HABITAT;
      targetPosition: Vector2D;
    }
  | {
      decision: LeaderDecision.ATTACK_WEAKER_TRIBE_FOR_HABITAT;
      targetPosition: Vector2D;
      enemyTribeId: EntityId;
    }
  | {
      decision: LeaderDecision.CALL_TO_ATTACK_FOR_DEFENSE;
    };

export class LeaderMetaStrategy implements HumanAIStrategy<LeaderStrategyCheckResult> {
  check(leader: HumanEntity, context: UpdateContext): LeaderStrategyCheckResult | null {
    const { gameState } = context;
    const indexedState = gameState as IndexedWorldState;

    // This strategy only applies to leaders and only runs when the cooldown is ready.
    if (leader.id !== leader.leaderId || (leader.leaderMetaStrategyCooldown ?? 0) > 0) {
      return null;
    }

    const ownTribe = getTribeForLeader(leader.id, indexedState);
    if (ownTribe.length === 0) {
      return null; // Should not happen if the leader is part of their own tribe
    }

    // 1. Defensive check: Is the tribe under attack?
    if (isTribeUnderAttack(ownTribe, indexedState)) {
      return { decision: LeaderDecision.CALL_TO_ATTACK_FOR_DEFENSE };
    }

    // 2. Analyze current situation
    const ownTribeStrength = calculateTribeStrength(ownTribe);
    const { score: currentHabitatScore } = calculateHabitabilityScore(
      leader.position,
      LEADER_WORLD_ANALYSIS_GRID_SIZE / 2,
      indexedState,
      leader.id,
    );

    // 3. Find the best potential habitat in the world
    const bestHabitat = findBestHabitat(indexedState, leader.id, LEADER_WORLD_ANALYSIS_GRID_STEP);
    if (!bestHabitat || bestHabitat.score <= currentHabitatScore) {
      return null; // Current spot is the best or good enough
    }

    // 4. Decide based on the best habitat found
    const isNewHabitatSuperior = bestHabitat.score > currentHabitatScore * LEADER_MIGRATION_SUPERIORITY_THRESHOLD;

    if (bestHabitat.occupyingTribeId) {
      // The best spot is occupied by another tribe
      const enemyTribe = getTribeForLeader(bestHabitat.occupyingTribeId, indexedState);
      const enemyTribeStrength = calculateTribeStrength(enemyTribe);

      const isOurTribeStronger =
        ownTribeStrength > enemyTribeStrength * LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD;

      if (isNewHabitatSuperior && isOurTribeStronger) {
        return {
          decision: LeaderDecision.ATTACK_WEAKER_TRIBE_FOR_HABITAT,
          targetPosition: bestHabitat.position,
          enemyTribeId: bestHabitat.occupyingTribeId,
        };
      } else {
        // We are not strong enough to attack, so we should avoid them.
        // Let's find the best *unoccupied* habitat.
        const bestUnoccupiedHabitat = findBestHabitat(indexedState, leader.id, LEADER_WORLD_ANALYSIS_GRID_STEP);
        if (
          bestUnoccupiedHabitat &&
          !bestUnoccupiedHabitat.occupyingTribeId &&
          bestUnoccupiedHabitat.score > currentHabitatScore
        ) {
          return {
            decision: LeaderDecision.MIGRATE_TO_SAFER_HABITAT,
            targetPosition: bestUnoccupiedHabitat.position,
          };
        }
      }
    } else {
      // The best spot is unoccupied
      if (isNewHabitatSuperior) {
        return {
          decision: LeaderDecision.MIGRATE_TO_BETTER_HABITAT,
          targetPosition: bestHabitat.position,
        };
      }
    }

    return null;
  }

  execute(leader: HumanEntity, context: UpdateContext, checkResult: LeaderStrategyCheckResult): void {
    leader.leaderMetaStrategyCooldown = LEADER_META_STRATEGY_COOLDOWN_HOURS; // Reset cooldown

    switch (checkResult.decision) {
      case LeaderDecision.MIGRATE_TO_SAFER_HABITAT:
      case LeaderDecision.MIGRATE_TO_BETTER_HABITAT:
        leader.activeAction = 'moving';
        leader.targetPosition = checkResult.targetPosition;
        break;

      case LeaderDecision.ATTACK_WEAKER_TRIBE_FOR_HABITAT:
        // First, move towards the target habitat
        leader.activeAction = 'moving';
        leader.targetPosition = checkResult.targetPosition;
        // Once there, other strategies (like TribeBattle or Attacking) will likely take over.
        // We can also initiate a call to attack to rally the tribe for the invasion.
        leader.isCallingToAttack = true;
        leader.callToAttackEndTime = context.gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
        break;

      case LeaderDecision.CALL_TO_ATTACK_FOR_DEFENSE:
        leader.isCallingToAttack = true;
        leader.callToAttackEndTime = context.gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
        // The leader doesn't move, but lets the followers engage via TribeBattleStrategy
        leader.activeAction = 'idle';
        leader.targetPosition = undefined;
        break;
    }
  }
}
