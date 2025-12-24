import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence, TribalTaskDecorator } from '../nodes';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { COLD_THRESHOLD, BONFIRE_HEAT_RADIUS, BONFIRE_MAX_USERS } from '../../../temperature/temperature-consts';
import { getTemperatureAt } from '../../../temperature/temperature-update';
import { findClosestEntity } from '../../../utils';
import { BuildingEntity, BuildingType } from '../../../entities/buildings/building-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { Blackboard } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types';
import {
  getTribeLeaderForCoordination,
  TribalTaskData,
  TRIBAL_TASK_TIMEOUT_HOURS,
} from '../../../entities/tribe/tribe-task-utils';
import { Vector2D } from '../../../utils/math-types';

const BONFIRE_TARGET_KEY = 'bonfireTargetId';
const BONFIRE_SEARCH_RADIUS = 800;

/**
 * Creates a behavior that makes a human seek warmth at a bonfire when they are cold.
 * Uses TribalTaskDecorator to coordinate distribution among multiple bonfires.
 */
export function createGatherAtBonfireBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is it cold enough to seek warmth?
      new ConditionNode(
        (human, context) => {
          const localTemp = getTemperatureAt(
            context.gameState.temperature,
            human.position,
            context.gameState.time,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // Seek warmth if below comfortable threshold (COLD_THRESHOLD + 8)
          const isCold = localTemp < COLD_THRESHOLD + 8;
          return [isCold, `Temp: ${localTemp.toFixed(1)}°C` + (isCold ? ' (Cold)' : '')];
        },
        'Is Cold?',
        depth + 1,
      ),

      // 2. Action: Find the closest fueled bonfire that is not at capacity
      new ActionNode(
        (human, context, blackboard) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);

          const closestBonfire = findClosestEntity<BuildingEntity>(
            human,
            context.gameState,
            'building',
            BONFIRE_SEARCH_RADIUS,
            (b) => {
              const isFueledBonfire =
                b.buildingType === BuildingType.Bonfire &&
                b.isConstructed &&
                !b.isBeingDestroyed &&
                (b.fuelLevel ?? 0) > 0;

              if (!isFueledBonfire) return false;

              if (b.ownerId !== human.leaderId) return false;

              // Check capacity via TribalTask coordination
              if (leader && leader.aiBlackboard) {
                const taskKey = `tribal_warmth_${b.id}`;
                const task = Blackboard.get<TribalTaskData>(leader.aiBlackboard, taskKey);
                if (task) {
                  // If task is active and at capacity, and I'm not part of it
                  if (
                    context.gameState.time - task.startTime <= TRIBAL_TASK_TIMEOUT_HOURS &&
                    task.memberIds.length >= BONFIRE_MAX_USERS &&
                    !task.memberIds.includes(human.id)
                  ) {
                    return false;
                  }
                }
              }

              return true;
            },
          );

          if (closestBonfire) {
            Blackboard.set(blackboard, BONFIRE_TARGET_KEY, closestBonfire.id);
            return [NodeStatus.SUCCESS, `Found bonfire ${closestBonfire.id}`];
          }

          Blackboard.delete(blackboard, BONFIRE_TARGET_KEY);
          return [NodeStatus.FAILURE, 'No available fueled bonfires found'];
        },
        'Find Bonfire',
        depth + 1,
      ),

      // 3. Action: Move to or stay near the bonfire (Coordinated)
      new TribalTaskDecorator(
        new ActionNode(
          (human, context, blackboard) => {
            const bonfireId = Blackboard.get<EntityId>(blackboard, BONFIRE_TARGET_KEY);
            const bonfire = bonfireId && (context.gameState.entities.entities[bonfireId] as BuildingEntity | undefined);

            if (!bonfire || (bonfire.fuelLevel ?? 0) <= 0 || !bonfire.isConstructed) {
              Blackboard.delete(blackboard, BONFIRE_TARGET_KEY);
              return NodeStatus.FAILURE;
            }

            // Calculate personal spot around the bonfire to prevent clustering
            // Use entity ID to derive a stable angle
            const angle = ((human.id * 137) % 360) * (Math.PI / 180);
            const radius = BONFIRE_HEAT_RADIUS * 0.4;

            const worldWidth = context.gameState.mapDimensions.width;
            const worldHeight = context.gameState.mapDimensions.height;

            const personalSpot: Vector2D = {
              x: (bonfire.position.x + Math.cos(angle) * radius + worldWidth) % worldWidth,
              y: (bonfire.position.y + Math.sin(angle) * radius + worldHeight) % worldHeight,
            };

            const distanceToSpot = calculateWrappedDistance(human.position, personalSpot, worldWidth, worldHeight);

            if (distanceToSpot > 10) {
              human.activeAction = 'moving';
              human.target = personalSpot;
              human.direction = dirToTarget(human.position, personalSpot, context.gameState.mapDimensions);
              return [NodeStatus.RUNNING, `Moving to personal warmth spot (${distanceToSpot.toFixed(0)}px away)`];
            } else {
              // Stay near the fire at personal spot
              human.activeAction = 'idle';
              human.direction = { x: 0, y: 0 };
              human.target = undefined;
              return [NodeStatus.RUNNING, 'Staying warm at personal spot'];
            }
          },
          'Move to Warmth Spot',
          depth + 2,
        ),
        {
          taskType: 'warmth',
          maxCapacity: BONFIRE_MAX_USERS,
          getTargetId: (_entity, _context, blackboard) =>
            Blackboard.get<EntityId>(blackboard, BONFIRE_TARGET_KEY) ?? null,
        },
        'Tribal Warmth Task',
        depth + 1,
      ),
    ],
    'Gather at Bonfire Sequence',
    depth,
  );
}
