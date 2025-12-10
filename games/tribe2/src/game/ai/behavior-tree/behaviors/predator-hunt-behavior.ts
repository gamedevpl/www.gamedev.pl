import { PREDATOR_HUNT_RANGE } from '../../../animal-consts.ts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, TimeoutNode, TribalTaskDecorator } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { Blackboard } from '../behavior-tree-blackboard.ts';
import { EntityId } from '../../../entities/entities-types.ts';
import {
  getTribeLeaderForCoordination,
  TribalTaskData,
  MAX_HUNTERS_PER_PREY,
  TRIBAL_TASK_TIMEOUT_HOURS,
} from '../../../entities/tribe/tribe-task-utils.ts';
import { HumanEntity } from '../../../entities/characters/human/human-types';

const HUNT_TARGET_KEY = 'huntTarget';

// Helper to check if a hunt task is available (using generic task data)
function canJoinTribalHuntTask(leader: HumanEntity | null, preyId: EntityId, currentTime: number): boolean {
  if (!leader?.aiBlackboard) return true;

  const taskKey = `tribal_hunt_${preyId}`;
  const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);

  if (!task) return true;
  if (currentTime - task.startTime > TRIBAL_TASK_TIMEOUT_HOURS) return true;

  return task.memberIds.length < (task.maxCapacity || MAX_HUNTERS_PER_PREY);
}

function getTribalHuntTaskCount(leader: HumanEntity | null, preyId: EntityId): number {
  if (!leader?.aiBlackboard) return 0;
  const taskKey = `tribal_hunt_${preyId}`;
  const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
  return task?.memberIds.length ?? 0;
}

/**
 * Creates a behavior sub-tree for predators hunting prey.
 */
export function createPredatorHuntBehavior(depth: number): BehaviorNode<PredatorEntity> {
  return new Sequence(
    [
      // Condition: Should I hunt?
      new ConditionNode(
        (predator, context: UpdateContext, blackboard) => {
          if (!predator.isAdult) {
            return [false, 'Not an adult'];
          }

          // Only hunt if moderately hungry and not on cooldown
          if (predator.hunger <= 50 || (predator.huntCooldown && predator.huntCooldown > 0)) {
            return false;
          }

          // Find nearby prey
          const closestPrey = findClosestEntity<PreyEntity>(
            predator,
            context.gameState,
            'prey',
            PREDATOR_HUNT_RANGE * 10, // Search in wider range
            (prey) => {
              if (prey.hitpoints <= 0) return false; // Target must be alive

              // Check if this prey is already being hunted by too many predators
              const leader = getTribeLeaderForCoordination(predator as any, context.gameState);
              if (leader && !canJoinTribalHuntTask(leader, prey.id, context.gameState.time)) {
                return false; // Too many hunters already
              }

              return true;
            },
          );

          if (closestPrey) {
            const distance = calculateWrappedDistance(
              predator.position,
              closestPrey.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            const leader = getTribeLeaderForCoordination(predator as any, context.gameState);
            const hunterCount = leader ? getTribalHuntTaskCount(leader, closestPrey.id) : 0;

            if (distance <= PREDATOR_HUNT_RANGE) {
              // Prey is within hunting range
              Blackboard.set(blackboard, HUNT_TARGET_KEY, closestPrey.id);
              return [true, `Prey in range (${hunterCount} hunters)`];
            } else if (distance <= PREDATOR_HUNT_RANGE * 10) {
              // Prey found but need to get closer
              Blackboard.set(blackboard, HUNT_TARGET_KEY, closestPrey.id);
              Blackboard.set(blackboard, 'needToApproach', true);
              return [true, `Approaching prey (${hunterCount} hunters)`];
            }
          }

          return false;
        },
        'Find Prey Target',
        depth + 1,
      ),
      // Action: Hunt or approach prey
      new TribalTaskDecorator(
        new TimeoutNode(
          new ActionNode(
            (predator, context: UpdateContext, blackboard) => {
              const targetId = Blackboard.get(blackboard, HUNT_TARGET_KEY) as EntityId | undefined;
              const target = targetId && (context.gameState.entities.entities[targetId] as PreyEntity | undefined);
              const needToApproach = Blackboard.get(blackboard, 'needToApproach') as boolean | undefined;

              if (!target || target.hitpoints <= 0) {
                // Target is dead or gone, cleanup local blackboard
                Blackboard.delete(blackboard, HUNT_TARGET_KEY);
                Blackboard.delete(blackboard, 'needToApproach');
                return NodeStatus.SUCCESS; // Hunt completed or target lost
              }

              const distance = calculateWrappedDistance(
                predator.position,
                target.position,
                context.gameState.mapDimensions.width,
                context.gameState.mapDimensions.height,
              );

              if (distance <= PREDATOR_HUNT_RANGE) {
                // Within hunting range, start attacking
                predator.activeAction = 'attacking';
                predator.attackTargetId = target.id;
                predator.target = target.id;
                predator.direction = { x: 0, y: 0 };
                Blackboard.delete(blackboard, 'needToApproach');
                return NodeStatus.RUNNING;
              } else if (needToApproach || distance > PREDATOR_HUNT_RANGE) {
                // Need to move closer to the prey
                predator.activeAction = 'moving';
                predator.target = target.id;

                const directionToTarget = getDirectionVectorOnTorus(
                  predator.position,
                  target.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                predator.direction = vectorNormalize(directionToTarget);
                return NodeStatus.RUNNING;
              }

              return NodeStatus.FAILURE;
            },
            'Hunt or Approach Prey',
            depth + 3,
          ),
          10,
          'Hunt Timeout (10 hour)',
          depth + 2,
        ),
        {
          taskType: 'hunt',
          maxCapacity: MAX_HUNTERS_PER_PREY,
          getTargetId: (_entity, _context, blackboard) => Blackboard.get(blackboard, HUNT_TARGET_KEY) as EntityId,
        },
        'Tribal Hunt Decorator',
        depth + 1,
      ),
    ],
    'Predator Hunt',
    depth,
  );
}
