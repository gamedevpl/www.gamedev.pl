import { HumanEntity } from '../../../entities/characters/human/human-types';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils';
import { HUMAN_ATTACKING } from '../../../entities/characters/human/states/human-state-types';

const DEFEND_TARGET_KEY = 'defendTarget';
const PREDATOR_THREAT_RANGE = 150; // Range to detect predator threats

/**
 * Creates a behavior tree branch for humans defending against predator attacks.
 * Humans will fight back when predators get too close or attack them.
 */
export function createHumanDefendAgainstPredatorBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is there a predator threat?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult - children flee instead'];
          }

          const { gameState } = context;

          // If already defending against a valid target, continue
          if (human.activeAction === 'attacking' && human.attackTargetId) {
            const currentTarget = gameState.entities.entities.get(human.attackTargetId) as PredatorEntity;
            if (
              currentTarget &&
              currentTarget.type === 'predator' &&
              currentTarget.hitpoints > 0 &&
              calculateWrappedDistance(
                human.position,
                currentTarget.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              ) <= PREDATOR_THREAT_RANGE
            ) {
              blackboard.set(DEFEND_TARGET_KEY, currentTarget);
              return [true, 'Continuing defense'];
            }
          }

          // Find the closest predator threat
          const predator = findClosestEntity<PredatorEntity>(
            human,
            gameState,
            'predator',
            PREDATOR_THREAT_RANGE,
            (entity) => entity.hitpoints > 0 && (entity.isAdult || false), // Only defend against adult predators
          );

          if (predator) {
            // Check if predator is actively hunting or attacking
            const distance = calculateWrappedDistance(
              human.position,
              predator.position,
              gameState.mapDimensions.width,
              gameState.mapDimensions.height,
            );

            // Defend if predator is close or if it's targeting this human
            const isTargetingHuman = predator.attackTargetId === human.id;
            const isClose = distance < 80; // Close proximity triggers defense

            if (isTargetingHuman || isClose) {
              blackboard.set(DEFEND_TARGET_KEY, predator);
              return [true, 'Predator threat detected'];
            }
          }

          blackboard.set(DEFEND_TARGET_KEY, undefined);
          return [false, 'No predator threat'];
        },
        'Detect Predator Threat',
        depth + 1,
      ),

      // 2. Action: Defend against the predator
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<PredatorEntity>(DEFEND_TARGET_KEY);

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

          // Check if target is still valid and alive
          if (target.hitpoints <= 0) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            return NodeStatus.SUCCESS; // Threat eliminated
          }

          // If too far, the threat has passed
          if (distanceToTarget > PREDATOR_THREAT_RANGE * 1.5) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            return NodeStatus.SUCCESS; // Threat passed
          }

          // Set defensive attack state
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;
          human.stateMachine = [HUMAN_ATTACKING, { enteredAt: context.gameState.time }];

          // The actual combat is handled by the interaction system
          return NodeStatus.RUNNING;
        },
        'Defend Against Predator',
        depth + 1,
      ),
    ],
    'Human Defend Against Predator',
    depth,
  );
}
