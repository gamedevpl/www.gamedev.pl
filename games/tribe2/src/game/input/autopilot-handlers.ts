import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { TreeEntity } from '../entities/plants/tree/tree-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { FoodType } from '../entities/food-types.ts';
import { PlayerActionType } from '../ui/ui-types';
import { ItemType } from '../entities/item-types';
import { TREE_GROWING, TREE_FULL, TREE_SPREADING, TREE_FALLEN } from '../entities/plants/tree/states/tree-state-types';
import {
  BERRY_BUSH_PLANTING_CLEARANCE_RADIUS,
  BERRY_COST_FOR_PLANTING,
} from '../entities/plants/berry-bush/berry-bush-consts.ts';
import { GameWorldState, HoveredAutopilotAction, DiplomacyStatus } from '../world-types';
import {
  findEntityAtPosition,
  findPlayerEntity,
  isPositionInAnyPlantingZone,
  isHostile,
  canProcreate,
  isPositionOccupied,
  isEnemyBuilding,
} from '../utils';
import { Vector2D } from '../utils/math-types';
import {
  createBuilding,
  canPlaceBuilding,
  findBuildingAtPosition,
  startBuildingDestruction,
} from '../utils/building-placement-utils';
import { BuildingEntity, BuildingType } from '../entities/buildings/building-types';
import { isSoilDepleted } from '../entities/plants/soil-depletion-update.ts';
import { calculateWrappedDistance } from '../utils/math-utils.ts';
import { checkTakeoverContiguity } from '../entities/tribe/territory-utils';
import { TERRITORY_BUILDING_RADIUS } from '../entities/tribe/territory-consts';

/**
 * Determines the appropriate autopilot action based on the entity or position under the mouse cursor.
 * @param worldPos The mouse position in world coordinates.
 * @param player The player entity.
 * @param gameState The current game state.
 * @param shiftKey Whether the shift key is currently pressed.
 * @returns A determined autopilot action or undefined if no specific action is available.
 */
export const determineHoveredAutopilotAction = (
  worldPos: Vector2D,
  player: HumanEntity,
  gameState: GameWorldState,
  shiftKey: boolean = false,
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
    } else if (player.isAdult && hoveredEntity.type === 'corpse' && (hoveredEntity as HumanEntity).food.length > 0) {
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
      determinedAction = { action: PlayerActionType.AutopilotAttack, targetEntityId: hoveredEntity.id };
    } else if (hoveredEntity.type === 'predator') {
      determinedAction = { action: PlayerActionType.AutopilotAttack, targetEntityId: hoveredEntity.id };
    } else if (hoveredEntity.type === 'building') {
      const building = hoveredEntity as BuildingEntity;

      if (gameState.selectedBuildingType === 'removal') {
        // Removal tool selected - if enemy building, show RemoveEnemyBuilding; else just Removal
        if (player.leaderId === player.id && isEnemyBuilding(player, building, gameState) && building.isConstructed) {
          determinedAction = { action: PlayerActionType.RemoveEnemyBuilding, targetEntityId: building.id };
        } else {
          determinedAction = { action: PlayerActionType.Removal, position: hoveredEntity.position };
        }
      } else if (
        player.leaderId === player.id &&
        isEnemyBuilding(player, building, gameState) &&
        building.isConstructed
      ) {
        // Enemy building - only leaders can take over
        // Check if takeover is valid (must be adjacent to territory)
        const contiguityCheck = checkTakeoverContiguity(
          building.position,
          TERRITORY_BUILDING_RADIUS,
          player.id,
          gameState,
        );

        if (contiguityCheck.valid) {
          determinedAction = { action: PlayerActionType.TakeOverBuilding, targetEntityId: building.id };
        } else {
          // If not valid for takeover, default to move
          determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
        }
      } else if (building.buildingType === 'storageSpot') {
        // Handle storage spot interactions
        const isPlayerTribeStorage = building.ownerId === player.leaderId;
        const hasStoredFood = building.storedItems.length > 0;
        const hasStorageSpace =
          building.storageCapacity !== undefined && building.storedItems.length < building.storageCapacity;

        // SHIFT key pressed: prioritize RETRIEVE/STEAL if storage has food
        if (shiftKey && building.isConstructed && hasStoredFood && player.food.length < player.maxFood) {
          if (isPlayerTribeStorage) {
            // Player's tribe storage - RETRIEVE
            determinedAction = { action: PlayerActionType.AutopilotRetrieve, targetEntityId: hoveredEntity.id };
          } else {
            // Enemy storage - check if STEAL is possible
            const playerLeader = player.leaderId
              ? (gameState.entities.entities[player.leaderId] as HumanEntity | undefined)
              : undefined;

            if (playerLeader && playerLeader.tribeControl?.diplomacy) {
              const diplomacyStatus = building.ownerId && playerLeader.tribeControl.diplomacy[building.ownerId];
              if (diplomacyStatus === DiplomacyStatus.Hostile) {
                // Hostile tribe - suggest STEAL (actual stealing will be validated by interaction checker)
                determinedAction = { action: PlayerActionType.AutopilotGather, targetEntityId: hoveredEntity.id };
              } else {
                // Not hostile, just move
                determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
              }
            } else {
              // No diplomacy info, just move
              determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
            }
          }
        }
        // Normal behavior (no SHIFT): deposit/retrieve based on player's inventory
        else if (isPlayerTribeStorage && building.isConstructed) {
          if (player.food.length > 0 && hasStorageSpace) {
            // Can deposit
            determinedAction = { action: PlayerActionType.AutopilotDeposit, targetEntityId: hoveredEntity.id };
          } else if (player.food.length < player.maxFood && hasStoredFood) {
            // Can retrieve
            determinedAction = { action: PlayerActionType.AutopilotRetrieve, targetEntityId: hoveredEntity.id };
          } else {
            // Can't interact, just move
            determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
          }
        } else {
          // Not player's tribe storage, just move
          determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
        }
      } else if (
        building.buildingType === 'plantingZone' &&
        player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING &&
        !isPositionOccupied(worldPos, gameState, BERRY_BUSH_PLANTING_CLEARANCE_RADIUS) &&
        !isSoilDepleted(
          gameState.soilDepletion,
          worldPos,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        )
      ) {
        determinedAction = { action: PlayerActionType.AutopilotPlant, position: worldPos };
      } else if (
        building.buildingType === BuildingType.Bonfire &&
        player.heldItem?.type === ItemType.Wood &&
        building.isConstructed &&
        building.fuelLevel !== undefined &&
        building.maxFuelLevel !== undefined &&
        building.fuelLevel < building.maxFuelLevel
      ) {
        determinedAction = { action: PlayerActionType.AutopilotRefuel, targetEntityId: building.id };
      } else {
        determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
      }
    } else if (hoveredEntity.type === 'tree') {
      const tree = hoveredEntity as TreeEntity;
      const [treeState] = tree.stateMachine ?? [];
      const isStanding = treeState === TREE_GROWING || treeState === TREE_FULL || treeState === TREE_SPREADING;

      if (player.isAdult && !player.heldItem && isStanding) {
        determinedAction = { action: PlayerActionType.AutopilotChop, targetEntityId: tree.id };
      } else if (player.isAdult && !player.heldItem && treeState === TREE_FALLEN && tree.wood.length > 0) {
        determinedAction = { action: PlayerActionType.AutopilotGather, targetEntityId: tree.id };
      } else {
        determinedAction = { action: PlayerActionType.AutopilotMove, position: worldPos };
      }
    }
  } else {
    // --- POSITION-BASED ACTIONS ---
    if (
      player.food.filter((f) => f.type === FoodType.Berry).length >= BERRY_COST_FOR_PLANTING &&
      (gameState.autopilotControls.isManuallyPlanting || isPositionInAnyPlantingZone(worldPos, gameState, player)) &&
      !isSoilDepleted(gameState.soilDepletion, worldPos, gameState.mapDimensions.width, gameState.mapDimensions.height)
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
 * @param gameState The current game state, which will be mutated.
 * @param worldPos The position of the click in world coordinates.
 */
export const handleAutopilotClick = (gameState: GameWorldState, worldPos: Vector2D): void => {
  if (gameState.isPaused) return;

  const player = findPlayerEntity(gameState);
  if (!player) return;

  // Handle building placement
  if (gameState.selectedBuildingType && gameState.selectedBuildingType !== 'removal') {
    const buildingType = gameState.selectedBuildingType as BuildingType;

    // Check if player is within proximity to place building
    const distance = calculateWrappedDistance(
      player.position,
      worldPos,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    // Use a reasonable proximity threshold (100px)
    const placementProximity = 100;

    if (distance <= placementProximity) {
      // Player is close enough, place immediately
      if (canPlaceBuilding(worldPos, buildingType, player.leaderId, gameState, player.position, placementProximity)) {
        createBuilding(worldPos, buildingType, player.leaderId!, gameState);
        gameState.selectedBuildingType = null;
      }
    } else {
      // Player is too far, trigger movement to placement location
      if (canPlaceBuilding(worldPos, buildingType, player.leaderId, gameState)) {
        gameState.autopilotControls.activeAutopilotAction = {
          action: PlayerActionType.AutopilotBuildingPlacement,
          position: worldPos,
          buildingType: buildingType,
        };
        gameState.selectedBuildingType = null;
      }
    }
    return;
  }

  // Handle building removal
  if (gameState.selectedBuildingType === 'removal') {
    const building = findBuildingAtPosition(worldPos, gameState);
    if (building) {
      startBuildingDestruction(building.id, gameState);
    }
    return;
  }

  const hoveredAction = gameState.autopilotControls.hoveredAutopilotAction;

  // Always clear the previous active command
  gameState.autopilotControls.activeAutopilotAction = undefined;

  if (hoveredAction) {
    // Set the new active command based on the hovered action
    gameState.autopilotControls.activeAutopilotAction = hoveredAction;
    if (
      hoveredAction.action === PlayerActionType.AutopilotMove ||
      hoveredAction.action === PlayerActionType.AutopilotGather ||
      hoveredAction.action === PlayerActionType.AutopilotChop ||
      hoveredAction.action === PlayerActionType.AutopilotRefuel
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
