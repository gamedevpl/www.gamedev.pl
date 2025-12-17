import { HumanEntity } from '../../../entities/characters/human/human-types';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils';
import { Blackboard } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types';
import { HUMAN_THROW_RANGE } from '../../../human-consts.ts';

const THROW_DEFEND_TARGET_KEY = 'throwDefendTarget';
const PREDATOR_THREAT_RANGE = 180; // Range to detect predator threats for ranged defense

/**
 * Creates a behavior tree branch for humans throwing stones at predators in defense.
 * Humans will throw stones at predators that are approaching but not yet close enough for melee.
 */
export function createHumanThrowPredatorBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is there a predator threat within throw range?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult - children flee instead'];
          }

          if (human.hitpoints <= human.maxHitpoints * 0.3) {
            return [false, 'Too injured to defend'];
          }

          // Check if throw is available (not on cooldown)
          if (human.throwCooldown && human.throwCooldown > 0) {
            return [false, 'Throw on cooldown'];
          }

          const { gameState } = context;

          // If already throwing at a valid target, continue
          if (human.activeAction === 'throwing' && human.throwTargetId) {
            const currentTarget = gameState.entities.entities[human.throwTargetId] as PredatorEntity;
            if (
              currentTarget &&
              currentTarget.type === 'predator' &&
              currentTarget.hitpoints > 0 &&
              calculateWrappedDistance(
                human.position,
                currentTarget.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              ) <= HUMAN_THROW_RANGE
            ) {
              Blackboard.set(blackboard, THROW_DEFEND_TARGET_KEY, currentTarget.id);
              return [true, 'Continuing ranged defense'];
            }
          }

          // Find the closest predator threat within throw range
          const predator = findClosestEntity<PredatorEntity>(
            human,
            gameState,
            'predator',
            PREDATOR_THREAT_RANGE,
            (entity) => entity.hitpoints > 0 && (entity.isAdult || false), // Only defend against adult predators
          );

          if (predator) {
            const distance = calculateWrappedDistance(
              human.position,
              predator.position,
              gameState.mapDimensions.width,
              gameState.mapDimensions.height,
            );

            // Use ranged attack when predator is approaching but not too close
            // (leave melee for very close threats)
            const isInRangeForThrow = distance <= HUMAN_THROW_RANGE && distance > 50;
            const isTargetingHuman = predator.attackTargetId === human.id;

            if (isInRangeForThrow && (isTargetingHuman || distance < 100)) {
              Blackboard.set(blackboard, THROW_DEFEND_TARGET_KEY, predator.id);
              return [true, 'Predator threat detected - ranged defense'];
            }
          }

          Blackboard.set(blackboard, THROW_DEFEND_TARGET_KEY, undefined);
          return [false, 'No predator threat for ranged defense'];
        },
        'Detect Predator Threat (Ranged)',
        depth + 1,
      ),

      // 2. Action: Throw stone at the predator
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard) => {
          const targetId = Blackboard.get<EntityId>(blackboard, THROW_DEFEND_TARGET_KEY);
          const target = targetId && (context.gameState.entities.entities[targetId] as PredatorEntity | undefined);

          if (!target) {
            return NodeStatus.FAILURE;
          }

          const { gameState } = context;
          const distanceToTarget = calculateWrappedDistance(
            human.position,
            target.position,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          // Check if human should flee
          if (human.hitpoints < human.maxHitpoints * 0.3) {
            return NodeStatus.FAILURE; // Too injured to fight
          }

          // Check if target is still valid and alive
          if (target.hitpoints <= 0) {
            human.activeAction = 'idle';
            human.throwTargetId = undefined;
            return NodeStatus.SUCCESS; // Threat eliminated
          }

          // If too far, the threat has passed
          if (distanceToTarget > HUMAN_THROW_RANGE * 1.2) {
            human.activeAction = 'idle';
            human.throwTargetId = undefined;
            return NodeStatus.SUCCESS; // Threat passed
          }

          // Check if throw just went on cooldown (means we successfully threw)
          if (human.throwCooldown && human.throwCooldown > 0) {
            human.activeAction = 'idle';
            human.throwTargetId = undefined;
            return NodeStatus.SUCCESS; // Successfully threw
          }

          // Set throwing state
          human.activeAction = 'throwing';
          human.throwTargetId = target.id;

          // The actual throwing is handled by the interaction system
          return NodeStatus.RUNNING;
        },
        'Throw at Predator',
        depth + 1,
      ),
    ],
    'Human Throw at Predator Defense',
    depth,
  );
}
