/**
 * Mover Behavior Tree
 *
 * Implements the intelligent logistics agent behavior for the MOVER role.
 * Movers are responsible for:
 * 1. Checking their own hunger (self-sustain)
 * 2. Scanning for pending demands in the logistics registry
 * 3. Matching demands with available supplies
 * 4. Executing pickup and delivery operations
 * 5. Acting as relay points for long-distance logistics
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { ActionNode, ConditionNode, Sequence, Selector, CachingNode } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { BuildingEntity } from '../../../entities/buildings/building-types';
import {
  getPendingDemands,
  findBestSupplyForDemand,
  claimDemand,
  createMoverTask,
  getMoverTask,
  updateMoverTaskState,
  completeMoverTask,
  failMoverTask,
  shouldMoverSelfSustain,
  registerDemand,
  getSupply,
  updateTaskDeliveryLocation,
  registerRelayMoverSupply,
  removeRelayMoverSupply,
} from '../../../entities/tribe/logistics-utils';
import {
  MoverTaskState,
  DemandPriority,
  SupplyType,
  MoverTask,
} from '../../../entities/tribe/logistics-types';
import {
  LOGISTICS_MOVER_SEARCH_COOLDOWN_HOURS,
  LOGISTICS_PICKUP_DISTANCE,
  LOGISTICS_DELIVERY_DISTANCE,
  LOGISTICS_RELAY_DISTANCE_THRESHOLD,
  LOGISTICS_CRITICAL_HUNGER_THRESHOLD,
} from '../../../logistics-consts';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../human-consts';

// Blackboard keys
const MOVER_TASK_ID_KEY = 'moverTaskId';
const MOVER_SELF_DEMAND_KEY = 'moverSelfDemand';

/**
 * Creates the complete Mover behavior tree.
 * This behavior is only active for humans with the MOVER role.
 */
export function createMoverBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Check if this human is a Mover
      new ConditionNode(
        (human, context) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }
          return [isTribeRole(human, TribeRole.Mover, context.gameState), 'Role check'];
        },
        'Is Mover Role',
        depth + 1,
      ),

      // 2. Main behavior selector
      new Selector(
        [
          // Branch A: Continue existing task
          createContinueTaskBehavior(depth + 2),

          // Branch B: Find and start new task (with search cooldown)
          new CachingNode(
            createFindNewTaskBehavior(depth + 3),
            LOGISTICS_MOVER_SEARCH_COOLDOWN_HOURS,
            'Cache Mover Task Search',
            depth + 2,
          ),
        ],
        'Mover Task Selector',
        depth + 1,
      ),
    ],
    'Mover Behavior',
    depth,
  );
}

/**
 * Creates a behavior for continuing an existing mover task.
 */
function createContinueTaskBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Check if we have an active task
      new ConditionNode(
        (human, context, blackboard) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          if (!leader?.aiBlackboard) {
            return [false, 'No leader coordination'];
          }

          const task = getMoverTask(leader.aiBlackboard, human.id, context.gameState.time);
          if (!task) {
            return [false, 'No active task'];
          }

          // Store task ID for action node
          Blackboard.set(blackboard, MOVER_TASK_ID_KEY, task.id);
          return [true, `Task: ${task.state}`];
        },
        'Has Active Task',
        depth + 1,
      ),

      // Execute the task based on current state
      new ActionNode(
        (human, context, blackboard) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          if (!leader?.aiBlackboard) {
            return [NodeStatus.FAILURE, 'No leader'];
          }

          const taskId = Blackboard.get<string>(blackboard, MOVER_TASK_ID_KEY);
          if (!taskId) {
            return [NodeStatus.FAILURE, 'No task ID'];
          }

          const task = getMoverTask(leader.aiBlackboard, human.id, context.gameState.time);
          if (!task) {
            return [NodeStatus.FAILURE, 'Task not found'];
          }

          return executeMoverTask(human, task, leader.aiBlackboard, context);
        },
        'Execute Mover Task',
        depth + 1,
      ),
    ],
    'Continue Task',
    depth,
  );
}

/**
 * Creates a behavior for finding and starting a new mover task.
 */
function createFindNewTaskBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Check for self-sustain first
      new ConditionNode(
        (human, context, blackboard) => {
          // If mover is hungry, they might need to create a self-demand
          if (shouldMoverSelfSustain(human)) {
            // Check if we already have a self-demand
            const hasSelfDemand = Blackboard.get<boolean>(blackboard, MOVER_SELF_DEMAND_KEY);
            if (!hasSelfDemand) {
              const leader = getTribeLeaderForCoordination(human, context.gameState);
              if (leader?.aiBlackboard) {
                // Register self-demand with critical priority
                const hungerRatio = human.hunger / 150;
                const priority = hungerRatio > LOGISTICS_CRITICAL_HUNGER_THRESHOLD
                  ? DemandPriority.Critical
                  : DemandPriority.VeryHigh;

                registerDemand(
                  leader.aiBlackboard,
                  human.id,
                  'food',
                  1,
                  priority,
                  human.position,
                  context.gameState.time,
                );
                Blackboard.set(blackboard, MOVER_SELF_DEMAND_KEY, true);
              }
            }
            // Don't block task finding - another mover might deliver to us
          }
          return [true, 'Self-sustain check passed'];
        },
        'Self-Sustain Check',
        depth + 1,
      ),

      // Find a pending demand to fulfill
      new ActionNode(
        (human, context, blackboard) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          if (!leader?.aiBlackboard) {
            return [NodeStatus.FAILURE, 'No leader coordination'];
          }

          const currentTime = context.gameState.time;

          // Get pending demands sorted by priority
          const pendingDemands = getPendingDemands(leader.aiBlackboard, currentTime, 'food');
          if (pendingDemands.length === 0) {
            return [NodeStatus.FAILURE, 'No pending demands'];
          }

          // Find a demand we can fulfill
          for (const demand of pendingDemands) {
            // Skip our own demand (another mover should handle it)
            if (demand.requesterId === human.id) {
              continue;
            }

            // Find the best supply for this demand
            const supply = findBestSupplyForDemand(
              leader.aiBlackboard,
              demand,
              human,
              context.gameState,
              currentTime,
            );

            if (supply) {
              // Try to claim the demand
              if (claimDemand(leader.aiBlackboard, demand.id, human.id, currentTime)) {
                // Create a mover task
                const task = createMoverTask(
                  leader.aiBlackboard,
                  human.id,
                  demand,
                  supply,
                  currentTime,
                );

                Blackboard.set(blackboard, MOVER_TASK_ID_KEY, task.id);

                return [
                  NodeStatus.SUCCESS,
                  `Claimed demand from ${demand.requesterId}, supply from ${supply.sourceId}`,
                ];
              }
            }
          }

          return [NodeStatus.FAILURE, 'Could not claim any demand'];
        },
        'Find and Claim Demand',
        depth + 1,
      ),

      // Start executing the new task
      new ActionNode(
        (human, context, _blackboard) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          if (!leader?.aiBlackboard) {
            return [NodeStatus.FAILURE, 'No leader'];
          }

          const task = getMoverTask(leader.aiBlackboard, human.id, context.gameState.time);
          if (!task) {
            return [NodeStatus.FAILURE, 'Task not found'];
          }

          return executeMoverTask(human, task, leader.aiBlackboard, context);
        },
        'Start New Task',
        depth + 1,
      ),
    ],
    'Find New Task',
    depth,
  );
}

/**
 * Executes a mover task based on its current state.
 */
function executeMoverTask(
  human: HumanEntity,
  task: MoverTask,
  leaderBlackboard: BlackboardData,
  context: UpdateContext,
): [NodeStatus, string] {
  const { gameState } = context;
  const currentTime = gameState.time;
  const { width, height } = gameState.mapDimensions;

  switch (task.state) {
    case MoverTaskState.MovingToSupply: {
      // Move towards the supply location
      const distToSupply = calculateWrappedDistance(
        human.position,
        task.pickupLocation,
        width,
        height,
      );

      if (distToSupply <= LOGISTICS_PICKUP_DISTANCE) {
        // Arrived at supply - check if we need to wait or can pick up
        const supply = getSupply(leaderBlackboard, task.supplyId);

        if (!supply) {
          // Supply no longer exists
          failMoverTask(leaderBlackboard, task.id);
          return [NodeStatus.FAILURE, 'Supply disappeared'];
        }

        if (supply.type === SupplyType.Forecast) {
          // Need to wait for gatherer
          updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.WaitingForSupply, currentTime);
          human.activeAction = 'idle';
          human.direction = { x: 0, y: 0 };
          return [NodeStatus.RUNNING, 'Waiting for forecast supply'];
        } else {
          // Immediate supply - start pickup
          updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.PickingUp, currentTime);
          return [NodeStatus.RUNNING, 'Starting pickup'];
        }
      } else {
        // Keep moving to supply
        human.activeAction = 'moving';
        human.direction = dirToTarget(human.position, task.pickupLocation, gameState.mapDimensions);
        return [NodeStatus.RUNNING, `Moving to supply (${distToSupply.toFixed(0)}px)`];
      }
    }

    case MoverTaskState.WaitingForSupply: {
      // Check if supply has become available
      const supply = getSupply(leaderBlackboard, task.supplyId);

      if (!supply) {
        // Check if there's immediate supply at the target storage
        // The gatherer may have completed and the forecast was removed
        const storage = Object.values(gameState.entities.entities).find(
          (e) => e.type === 'building' && e.position.x === task.pickupLocation.x && e.position.y === task.pickupLocation.y,
        ) as BuildingEntity | undefined;

        if (storage?.storedFood && storage.storedFood.length > 0) {
          // Storage has food - proceed to pickup
          updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.PickingUp, currentTime);
          return [NodeStatus.RUNNING, 'Storage has food, starting pickup'];
        }

        // Check wait deadline
        if (task.waitDeadline && currentTime > task.waitDeadline) {
          failMoverTask(leaderBlackboard, task.id);
          return [NodeStatus.FAILURE, 'Wait timeout exceeded'];
        }

        human.activeAction = 'idle';
        human.direction = { x: 0, y: 0 };
        return [NodeStatus.RUNNING, 'Waiting for supply'];
      }

      if (supply.type === SupplyType.Immediate) {
        // Supply is now available
        updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.PickingUp, currentTime);
        return [NodeStatus.RUNNING, 'Supply available, starting pickup'];
      }

      // Still waiting for forecast
      if (task.waitDeadline && currentTime > task.waitDeadline) {
        failMoverTask(leaderBlackboard, task.id);
        return [NodeStatus.FAILURE, 'Wait timeout exceeded'];
      }

      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      return [NodeStatus.RUNNING, 'Waiting for forecast supply'];
    }

    case MoverTaskState.PickingUp: {
      // Pick up resources from the supply source
      const supply = getSupply(leaderBlackboard, task.supplyId);

      // Handle pickup from storage
      const storage = Object.values(gameState.entities.entities).find(
        (e) =>
          e.type === 'building' &&
          calculateWrappedDistance(e.position, task.pickupLocation, width, height) < LOGISTICS_PICKUP_DISTANCE,
      ) as BuildingEntity | undefined;

      if (storage?.storedFood && storage.storedFood.length > 0) {
        // Take food from storage
        const foodToTake = Math.min(task.amount, storage.storedFood.length, human.maxFood - human.food.length);

        if (foodToTake > 0) {
          for (let i = 0; i < foodToTake; i++) {
            const foodItem = storage.storedFood.pop();
            if (foodItem) {
              human.food.push(foodItem.item);
            }
          }

          // Check distance to requester for potential relay
          const distToRequester = calculateWrappedDistance(
            human.position,
            task.deliveryLocation,
            width,
            height,
          );

          if (distToRequester > LOGISTICS_RELAY_DISTANCE_THRESHOLD) {
            // Consider becoming a relay
            // For now, just proceed - relay logic can be added later
          }

          updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.MovingToRequester, currentTime);
          return [NodeStatus.RUNNING, `Picked up ${foodToTake} food, moving to requester`];
        }
      }

      // Handle pickup from relay mover
      if (supply?.isRelayMover) {
        const relayMover = gameState.entities.entities[supply.sourceId] as HumanEntity | undefined;
        if (relayMover && relayMover.food.length > 0) {
          const foodToTake = Math.min(task.amount, relayMover.food.length, human.maxFood - human.food.length);
          for (let i = 0; i < foodToTake; i++) {
            const foodItem = relayMover.food.pop();
            if (foodItem) {
              human.food.push(foodItem);
            }
          }
          // Remove relay supply entry
          removeRelayMoverSupply(leaderBlackboard, supply.sourceId, currentTime);

          updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.MovingToRequester, currentTime);
          return [NodeStatus.RUNNING, `Picked up ${foodToTake} from relay mover`];
        }
      }

      // No food available at pickup location
      failMoverTask(leaderBlackboard, task.id);
      return [NodeStatus.FAILURE, 'No food at pickup location'];
    }

    case MoverTaskState.MovingToRequester: {
      // Update delivery location in case requester moved
      const requester = gameState.entities.entities[
        getPendingDemands(leaderBlackboard, currentTime).find((d) => d.id === task.demandId)?.requesterId ?? -1
      ] as HumanEntity | undefined;

      if (requester) {
        updateTaskDeliveryLocation(leaderBlackboard, task.id, requester.position, currentTime);
      }

      const distToRequester = calculateWrappedDistance(
        human.position,
        task.deliveryLocation,
        width,
        height,
      );

      if (distToRequester <= LOGISTICS_DELIVERY_DISTANCE) {
        // Arrived at requester - start delivery
        updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.Delivering, currentTime);
        return [NodeStatus.RUNNING, 'Starting delivery'];
      } else {
        // Check if we should become a relay (too far)
        if (distToRequester > LOGISTICS_RELAY_DISTANCE_THRESHOLD && human.food.length > 0) {
          // Check if we're getting hungry ourselves
          if (shouldMoverSelfSustain(human)) {
            // Become a relay point instead of starving
            updateMoverTaskState(leaderBlackboard, task.id, MoverTaskState.RelayHolding, currentTime);
            registerRelayMoverSupply(
              leaderBlackboard,
              human.id,
              task.resourceType,
              human.food.length,
              human.position,
              currentTime,
            );
            return [NodeStatus.RUNNING, 'Becoming relay point (hungry)'];
          }
        }

        // Keep moving to requester
        human.activeAction = 'moving';
        human.direction = dirToTarget(human.position, task.deliveryLocation, gameState.mapDimensions);
        return [NodeStatus.RUNNING, `Moving to requester (${distToRequester.toFixed(0)}px)`];
      }
    }

    case MoverTaskState.Delivering: {
      // Transfer food to the requester
      const demand = getPendingDemands(leaderBlackboard, currentTime).find((d) => d.id === task.demandId);
      const requester = demand
        ? (gameState.entities.entities[demand.requesterId] as HumanEntity | undefined)
        : null;

      if (!requester) {
        // Requester is gone - task failed but we keep the food
        failMoverTask(leaderBlackboard, task.id);
        return [NodeStatus.FAILURE, 'Requester not found'];
      }

      // Check proximity
      const dist = calculateWrappedDistance(human.position, requester.position, width, height);
      if (dist > HUMAN_INTERACTION_PROXIMITY) {
        // Need to get closer
        human.activeAction = 'moving';
        human.direction = dirToTarget(human.position, requester.position, gameState.mapDimensions);
        return [NodeStatus.RUNNING, 'Getting closer to deliver'];
      }

      // Transfer food
      const foodToGive = Math.min(task.amount, human.food.length, requester.maxFood - requester.food.length);
      for (let i = 0; i < foodToGive; i++) {
        const foodItem = human.food.pop();
        if (foodItem) {
          requester.food.push(foodItem);
        }
      }

      // Complete the task
      completeMoverTask(leaderBlackboard, task.id, currentTime);
      human.activeAction = 'idle';
      return [NodeStatus.SUCCESS, `Delivered ${foodToGive} food to ${requester.id}`];
    }

    case MoverTaskState.RelayHolding: {
      // Standing as a relay point - waiting for another mover to pick up
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };

      // Check if our food was picked up
      if (human.food.length === 0) {
        // Another mover took the food - we're done
        removeRelayMoverSupply(leaderBlackboard, human.id, currentTime);
        completeMoverTask(leaderBlackboard, task.id, currentTime);
        return [NodeStatus.SUCCESS, 'Relay handoff complete'];
      }

      // Update relay supply position in case we move
      registerRelayMoverSupply(
        leaderBlackboard,
        human.id,
        task.resourceType,
        human.food.length,
        human.position,
        currentTime,
      );

      return [NodeStatus.RUNNING, 'Holding as relay point'];
    }

    case MoverTaskState.Completed:
    case MoverTaskState.Failed:
      return [NodeStatus.SUCCESS, 'Task already finished'];

    default:
      return [NodeStatus.FAILURE, `Unknown task state: ${task.state}`];
  }
}
