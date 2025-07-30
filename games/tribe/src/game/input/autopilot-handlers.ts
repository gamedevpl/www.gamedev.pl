import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { FoodType } from '../food/food-types';
import { PlayerActionType } from '../ui/ui-types';
import { BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, BERRY_COST_FOR_PLANTING } from '../world-consts';
import { GameWorldState, HoveredAutopilotAction } from '../world-types';
import {
  findEntityAtPosition,
  findPlayerEntity,
  findValidPlantingSpot,
  isHostile,
  canProcreate,
} from '../utils';
import { Vector2D } from '../utils/math-types';
import { calculateWrappedDistance } from '../utils/math-utils';

/**
 * Determines the appropriate autopilot action based on the entity or position under the mouse cursor.
 * @param worldPos The mouse position in world coordinates.
 * @param player The player entity.
 * @param gameState The current game state.
 * @returns A determined autopilot action or undefined if no specific action is available.
 */
export const determineHoveredAutopilotAction = (
  worldPos: Vector2D,
  player: HumanEntity,
  gameState: GameWorldState,
): HoveredAutopilotAction | undefined => {
  let determinedAction: HoveredAutopilotAction | undefined = undefined;
  const hoveredEntity = findEntityAtPosition(worldPos, gameState);

  if (hoveredEntity) {
    // --- ENTITY-BASED ACTIONS ---
    if (player.isAdult && hoveredEntity.type === 'berryBush' && (hoveredEntity as BerryBushEntity).food.length > 0) {
      determinedAction = {
        action: PlayerActionType.AutopilotGather,
        targetEntityId: hoveredEntity.id,
      };
    } else if (
      player.isAdult &&
      hoveredEntity.type === 'humanCorpse' &&
      (hoveredEntity as HumanEntity).food.length > 0
    ) {
      determinedAction = {
        action: PlayerActionType.AutopilotGather,
        targetEntityId: hoveredEntity.id,
      };
    } else if (hoveredEntity.type === 'human') {
      const targetHuman = hoveredEntity as HumanEntity;

      // Check for Attack
      if (player.isAdult && isHostile(player, targetHuman, gameState)) {
        determinedAction = { action: PlayerActionType.AutopilotAttack, targetEntityId: targetHuman.id };
      }
      // Check for Procreate
      else if (canProcreate(player, targetHuman, gameState)) {
        determinedAction = { action: PlayerActionType.AutopilotProcreate, targetEntityId: targetHuman.id };
      }
      // Check for Feed Child
      else if (
        player.food.length > 0 &&
        !targetHuman.isAdult &&
        (targetHuman.motherId === player.id || targetHuman.fatherId === player.id)
      ) {
        determinedAction = { action: PlayerActionType.AutopilotFeedChild, targetEntityId: targetHuman.id };
      }
    } else if (hoveredEntity.type === 'prey') {
      const targetPrey = hoveredEntity as PreyEntity;
      
      // Check if player can hunt this prey
      if (player.isAdult && targetPrey.hitpoints > 0) {
        const distance = calculateWrappedDistance(
          player.position,
          targetPrey.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        
        // Only offer hunt action if prey is reasonably close
        if (distance <= 120) {
          determinedAction = { action: PlayerActionType.AutopilotHuntPrey, targetEntityId: targetPrey.id };
        }
      }
    } else if (hoveredEntity.type === 'predator') {
      const targetPredator = hoveredEntity as PredatorEntity;
      
      // Check if player should defend against this predator
      if (player.isAdult && targetPredator.hitpoints > 0) {
        const distance = calculateWrappedDistance(
          player.position,
          targetPredator.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        
        // Only offer defend action if predator is close enough to be a threat
        if (distance <= 150) {
          determinedAction = { action: PlayerActionType.AutopilotDefendAgainstPredator, targetEntityId: targetPredator.id };
        }
      }
    }
  } else {
    // --- POSITION-BASED ACTIONS ---
    if (
      gameState.autopilotControls.isManuallyPlanting &&
      player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING &&
      findValidPlantingSpot(worldPos, gameState, 1, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS, player.id)
    ) {
      determinedAction = { action: PlayerActionType.AutopilotPlant, position: worldPos };
    } else {
      // Default to move if no other action is determined
      determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
    }
  }

  return determinedAction;
};

/**
 * Handles a click in the game world for autopilot actions.
 * It sets the active autopilot action based on what was hovered, or defaults to a move command.
 * @param gameState The current game state, which will be mutated.\\\\n * @param worldPos The position of the click in world coordinates.\\\\n */
export const handleAutopilotClick = (gameState: GameWorldState, worldPos: Vector2D): void => {
  if (gameState.isPaused) return;

  const player = findPlayerEntity(gameState);
  if (!player) return;

  const hoveredAction = gameState.autopilotControls.hoveredAutopilotAction;

  // Always clear the previous active command
  gameState.autopilotControls.activeAutopilotAction = undefined;

  if (hoveredAction) {
    // Set the new active command based on the hovered action
    gameState.autopilotControls.activeAutopilotAction = hoveredAction;
    if (
      hoveredAction.action === PlayerActionType.AutopilotMove ||
      hoveredAction.action === PlayerActionType.AutopilotGather
    ) {
      gameState.hasPlayerMovedEver = true;
    }
    if (hoveredAction.action === PlayerActionType.AutopilotPlant) {
      gameState.hasPlayerPlantedBush = true;
    }
  } else {
    // Fallback to default click-to-move if no specific action is hovered
    gameState.autopilotControls.activeAutopilotAction = {
      action: PlayerActionType.AutopilotMove,
      position: worldPos,
    };
  }

  gameState.autopilotControls.isManuallyMoving = false;
  gameState.autopilotControls.isManuallyPlanting = false;
};
