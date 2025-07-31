import { HumanEntity } from '../../../entities/characters/human/human-types';
// PreyEntity and PredatorEntity types used for type checking in switch cases
import { UpdateContext, GameWorldState } from '../../../world-types';
import { Entity } from '../../../entities/entities-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import {
  AUTOPILOT_ACTION_PROXIMITY,
  AUTOPILOT_MOVE_DISTANCE_THRESHOLD,
  BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
  FATHER_FOLLOW_STOP_DISTANCE,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { PlayerActionType } from '../../../ui/ui-types';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { canProcreate, isPositionOccupied } from '../../../utils';

/**
 * Shared autopilot attack behavior logic used by multiple action types.
 * This demonstrates that AutopilotAttack, AutopilotHuntPrey, and AutopilotDefendAgainstPredator
 * have identical behavior - they differ only in target validation.
 */
function handleAutopilotAttack(
  gameState: GameWorldState,
  human: HumanEntity,
  activeAction: { targetEntityId: number },
  targetValidator?: (target: Entity) => boolean
): NodeStatus {
  const target = gameState.entities.entities.get(activeAction.targetEntityId);

  // Validate target existence, hitpoints, and optional type-specific validation
  if (!target || !('hitpoints' in target) || (target as { hitpoints: number }).hitpoints <= 0) {
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return NodeStatus.FAILURE;
  }

  // Apply optional target validation (e.g., type === 'prey')
  if (targetValidator && !targetValidator(target)) {
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return NodeStatus.FAILURE;
  }

  const distance = calculateWrappedDistance(
    human.position,
    target.position,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
    human.activeAction = 'attacking';
    human.attackTargetId = target.id;
    gameState.autopilotControls.activeAutopilotAction = undefined;
    return NodeStatus.SUCCESS;
  }

  human.activeAction = 'moving';
  human.target = target.id;
  human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
  return NodeStatus.RUNNING;
}

/**
 * Creates a behavior that handles all direct player commands via the autopilot system.
 * This is a high-priority behavior for the player character that interprets and executes
 * actions like moving, gathering, attacking, etc., based on player input.
 */
export function createPlayerCommandBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Is there an active autopilot command for the player?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          return human.isPlayer === true && !!context.gameState.autopilotControls.activeAutopilotAction;
        },
        'Has Player Command',
        depth + 1,
      ),

      // 2. Action: Execute the command.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext) => {
          const { gameState } = context;
          const activeAction = gameState.autopilotControls.activeAutopilotAction;

          // Should always be true due to the preceding ConditionNode, but as a safeguard:
          if (!activeAction) {
            return NodeStatus.FAILURE;
          }

          // Use a switch to handle the various player commands
          switch (activeAction.action) {
            // --- MOVE ---
            case PlayerActionType.AutopilotMove: {
              const targetPosition = activeAction.position;
              const distance = calculateWrappedDistance(
                human.position,
                targetPosition,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance < AUTOPILOT_MOVE_DISTANCE_THRESHOLD) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                if (human.activeAction === 'moving') {
                  human.activeAction = 'idle';
                  human.target = undefined;
                }
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = targetPosition;
              human.direction = dirToTarget(human.position, targetPosition, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- GATHER ---
            case PlayerActionType.AutopilotGather: {
              const targetBush = gameState.entities.entities.get(activeAction.targetEntityId) as
                | BerryBushEntity
                | undefined;

              if (!targetBush || targetBush.food.length === 0) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                targetBush.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance > HUMAN_INTERACTION_PROXIMITY) {
                human.activeAction = 'moving';
                human.target = targetBush.id;
                human.direction = dirToTarget(human.position, targetBush.position, gameState.mapDimensions);
                return NodeStatus.RUNNING;
              }

              human.activeAction = 'gathering';
              human.target = targetBush.id;
              gameState.autopilotControls.activeAutopilotAction = undefined;
              return NodeStatus.SUCCESS;
            }

            // --- ATTACK ---
            case PlayerActionType.AutopilotAttack: {
              // Generic attack that works with any attackable entity
              return handleAutopilotAttack(gameState, human, activeAction);
            }

            // --- PROCREATE ---
            case PlayerActionType.AutopilotProcreate: {
              const target = gameState.entities.entities.get(activeAction.targetEntityId) as HumanEntity | undefined;

              if (!target || target.type !== 'human' || !canProcreate(human, target, context.gameState)) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
                human.activeAction = 'procreating';
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = target.id;
              human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- PLANT ---
            case PlayerActionType.AutopilotPlant: {
              if (human.activeAction === 'planting') {
                return NodeStatus.RUNNING;
              }

              const plantTarget = activeAction.position;
              if (isPositionOccupied(plantTarget, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, human.id)) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                plantTarget,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
                human.activeAction = 'planting';
                human.target = plantTarget;
                gameState.autopilotControls.activeAutopilotAction = undefined;
                gameState.hasPlayerPlantedBush = true;
                return NodeStatus.RUNNING;
              }

              human.activeAction = 'moving';
              human.target = plantTarget;
              human.direction = dirToTarget(human.position, plantTarget, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- FEED CHILD ---
            case PlayerActionType.AutopilotFeedChild: {
              const target = gameState.entities.entities.get(activeAction.targetEntityId) as HumanEntity | undefined;

              if (!target || target.type !== 'human' || target.isAdult || human.food.length === 0) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= AUTOPILOT_ACTION_PROXIMITY) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                human.activeAction = 'feeding';
                return NodeStatus.SUCCESS;
              }

              human.activeAction = 'moving';
              human.target = target.id;
              human.direction = dirToTarget(human.position, target.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            // --- FOLLOW LEADER ---
            case PlayerActionType.AutopilotFollowMe: {
              const leader = gameState.entities.entities.get(activeAction.targetEntityId) as HumanEntity | undefined;

              if (!leader || leader.type !== 'human' || leader.id !== leader.leaderId) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                return NodeStatus.FAILURE;
              }

              const distance = calculateWrappedDistance(
                human.position,
                leader.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              if (distance <= FATHER_FOLLOW_STOP_DISTANCE) {
                gameState.autopilotControls.activeAutopilotAction = undefined;
                if (human.activeAction === 'moving') {
                  human.activeAction = 'idle';
                }
                return NodeStatus.SUCCESS;
              }
              human.activeAction = 'moving';
              human.target = leader.id;
              human.direction = dirToTarget(human.position, leader.position, gameState.mapDimensions);
              return NodeStatus.RUNNING;
            }

            default:
              // Unknown or unhandled action, clear it.
              gameState.autopilotControls.activeAutopilotAction = undefined;
              return NodeStatus.FAILURE;
          }
        },
        'Execute Player Command',
        depth + 1,
      ),
    ],
    'Player Command Handler',
    depth,
  );
}
