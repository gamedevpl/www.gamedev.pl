import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { findClosestEntity, findValidPlantingSpot, performTribeSplit, isHostile, canProcreate } from '../utils';
import { HUMAN_INTERACTION_RANGE, HUMAN_ATTACK_RANGE } from '../human-consts.ts';
import { BERRY_BUSH_SPREAD_RADIUS } from '../entities/plants/berry-bush/berry-bush-consts.ts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { calculateWrappedDistance } from '../utils/math-utils';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { CorpseEntity } from '../entities/characters/corpse-types';
import { PlayerActionHint, PlayerActionType } from '../ui/ui-types';
import { PreyEntity } from '../entities/characters/prey/prey-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { STORAGE_INTERACTION_RANGE } from '../entities/buildings/storage-spot-consts.ts';

/**
 * Handles keyboard events that correspond to direct player actions.
 * @param key The key that was pressed (lowercase).
 * @param shiftKey Whether the shift key was held down.
 * @param gameState The current game state (may be mutated).
 * @param playerEntity The player entity (will be mutated).
 * @param playerActionHints A ref to the list of available player actions.
 */
export const handlePlayerActionKeyDown = (
  key: string,
  shiftKey: boolean,
  gameState: GameWorldState,
  playerEntity: HumanEntity,
  playerActionHints: PlayerActionHint[],
): void => {
  const updateContext = { gameState, deltaTime: 0 };

  if (shiftKey && ['e', 'b', 'r', 'h'].includes(key)) {
    gameState.hasPlayerEnabledAutopilot++;
  }

  // Handle build menu shortcuts when menu is open
  if (gameState.buildMenuOpen) {
    if (key === '1') {
      gameState.selectedBuildingType = 'storageSpot';
      playSoundAt(updateContext, SoundType.ButtonClick, playerEntity.position);
      return;
    } else if (key === '2') {
      gameState.selectedBuildingType = 'plantingZone';
      playSoundAt(updateContext, SoundType.ButtonClick, playerEntity.position);
      return;
    } else if (key === '3') {
      gameState.selectedBuildingType = 'removal';
      playSoundAt(updateContext, SoundType.ButtonClick, playerEntity.position);
      return;
    }
  }

  if (key === 'escape') {
    if (gameState.selectedBuildingType) {
      gameState.selectedBuildingType = null;
      return;
    }
  }

  if (key === 'e') {
    if (shiftKey) {
      gameState.autopilotControls.behaviors.gathering = !gameState.autopilotControls.behaviors.gathering;
      return;
    }
    const gatherBushTarget = findClosestEntity<BerryBushEntity>(
      playerEntity,
      gameState,
      'berryBush',
      HUMAN_INTERACTION_RANGE,
      (b) => b.food.length > 0 && playerEntity.food.length < playerEntity.maxFood,
    );

    const gatherCorpseTarget = findClosestEntity<CorpseEntity>(
      playerEntity,
      gameState,
      'corpse',
      HUMAN_INTERACTION_RANGE,
      (c) => c.food.length > 0 && playerEntity.food.length < playerEntity.maxFood,
    );

    let target: BerryBushEntity | CorpseEntity | null = null;
    if (gatherBushTarget && gatherCorpseTarget) {
      target =
        calculateWrappedDistance(
          playerEntity.position,
          gatherBushTarget.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        ) <=
        calculateWrappedDistance(
          playerEntity.position,
          gatherCorpseTarget.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        )
          ? gatherBushTarget
          : gatherCorpseTarget;
    } else {
      target = gatherBushTarget || gatherCorpseTarget;
    }

    if (target) {
      playerEntity.activeAction = 'gathering';
      playSoundAt(updateContext, SoundType.Gather, playerEntity.position);
    }
  } else if (key === 'r') {
    if (shiftKey) {
      gameState.autopilotControls.behaviors.procreation = !gameState.autopilotControls.behaviors.procreation;
      return;
    }
    const potentialPartner = findClosestEntity<HumanEntity>(
      playerEntity,
      gameState,
      'human',
      HUMAN_INTERACTION_RANGE,
      (h) => canProcreate(playerEntity, h as HumanEntity, gameState),
    );
    if (potentialPartner) {
      playerEntity.activeAction = 'procreating';
      playSoundAt(updateContext, SoundType.Procreate, playerEntity.position);
    }
  } else if (key === 'f') {
    if (playerEntity.food.length > 0) {
      playerEntity.activeAction = 'eating';
      playSoundAt(updateContext, SoundType.Eat, playerEntity.position);
    }
  } else if (key === 'h') {
    if (shiftKey) {
      gameState.autopilotControls.behaviors.feedChildren = !gameState.autopilotControls.behaviors.feedChildren;
      return;
    }
    const feedAction = playerActionHints.find((a) => a.type === PlayerActionType.FeedChild);
    if (feedAction && feedAction.targetEntity) {
      playerEntity.activeAction = 'feeding';
      playerEntity.target = feedAction.targetEntity.id;
    }
  } else if (key === 'arrowup' || key === 'w') {
    playerEntity.direction.y = -1;
    playerEntity.activeAction = 'moving';
    playerEntity.target = undefined;
    gameState.hasPlayerMovedEver = true;
    gameState.autopilotControls.isManuallyMoving = true;
    gameState.autopilotControls.activeAutopilotAction = undefined;
  } else if (key === 'arrowdown' || key === 's') {
    playerEntity.direction.y = 1;
    playerEntity.activeAction = 'moving';
    playerEntity.target = undefined;
    gameState.hasPlayerMovedEver = true;
    gameState.autopilotControls.isManuallyMoving = true;
    gameState.autopilotControls.activeAutopilotAction = undefined;
  } else if (key === 'arrowleft' || key === 'a') {
    playerEntity.direction.x = -1;
    playerEntity.activeAction = 'moving';
    playerEntity.target = undefined;
    gameState.hasPlayerMovedEver = true;
    gameState.autopilotControls.isManuallyMoving = true;
    gameState.autopilotControls.activeAutopilotAction = undefined;
  } else if (key === 'arrowright' || key === 'd') {
    playerEntity.direction.x = 1;
    playerEntity.activeAction = 'moving';
    playerEntity.target = undefined;
    gameState.hasPlayerMovedEver = true;
    gameState.autopilotControls.isManuallyMoving = true;
    gameState.autopilotControls.activeAutopilotAction = undefined;
  } else if (key === 'q') {
    if (shiftKey) {
      gameState.autopilotControls.behaviors.attack = !gameState.autopilotControls.behaviors.attack;
      return;
    }
    const target =
      findClosestEntity<HumanEntity>(playerEntity, gameState, 'human', HUMAN_ATTACK_RANGE, (h) =>
        isHostile(playerEntity, h as HumanEntity, gameState),
      ) ??
      findClosestEntity<HumanEntity>(playerEntity, gameState, 'predator', HUMAN_ATTACK_RANGE) ??
      findClosestEntity<PreyEntity>(playerEntity, gameState, 'prey', HUMAN_ATTACK_RANGE);

    if (target) {
      playerEntity.activeAction = 'attacking';
      playerEntity.attackTargetId = target.id;
    }
  } else if (key === 'b') {
    if (shiftKey) {
      gameState.autopilotControls.behaviors.planting = !gameState.autopilotControls.behaviors.planting;
      return;
    }

    const plantAction = playerActionHints.find((a) => a.type === PlayerActionType.Plant);
    if (plantAction) {
      const plantingSpot = findValidPlantingSpot(playerEntity.position, gameState, 50, BERRY_BUSH_SPREAD_RADIUS);
      if (plantingSpot) {
        playerEntity.activeAction = 'planting';
        playerEntity.target = plantingSpot;
        gameState.hasPlayerPlantedBush = true;
      }
    }
  } else if (key === 'x') {
    // Deposit to storage
    if (shiftKey) {
      gameState.autopilotControls.behaviors.gathering = !gameState.autopilotControls.behaviors.gathering;
      return;
    }

    const storageSpot = findClosestEntity<BuildingEntity>(
      playerEntity,
      gameState,
      'building',
      STORAGE_INTERACTION_RANGE,
      (b) => {
        const building = b as BuildingEntity;
        return (
          building.buildingType === 'storageSpot' &&
          building.ownerId === playerEntity.leaderId &&
          building.isConstructed &&
          building.storedFood !== undefined &&
          building.storageCapacity !== undefined &&
          building.storedFood.length < building.storageCapacity
        );
      },
    );

    if (storageSpot) {
      playerEntity.activeAction = 'idle';
      playerEntity.target = storageSpot.id;
      playSoundAt(updateContext, SoundType.StorageDeposit, playerEntity.position);
    }
  } else if (key === 'z') {
    // Retrieve from storage
    if (shiftKey) {
      gameState.autopilotControls.behaviors.feedChildren = !gameState.autopilotControls.behaviors.feedChildren;
      return;
    }

    const storageSpot = findClosestEntity<BuildingEntity>(
      playerEntity,
      gameState,
      'building',
      STORAGE_INTERACTION_RANGE,
      (b) => {
        const building = b as BuildingEntity;
        return (
          building.buildingType === 'storageSpot' &&
          building.ownerId === playerEntity.leaderId &&
          building.isConstructed &&
          building.storedFood !== undefined &&
          building.storedFood.length > 0
        );
      },
    );

    if (storageSpot) {
      playerEntity.activeAction = 'idle';
      playerEntity.target = storageSpot.id;
      playSoundAt(updateContext, SoundType.StorageRetrieve, playerEntity.position);
    }
  } else if (key === 'k') {
    performTribeSplit(playerEntity, gameState);
  } else if (key === 'l') {
    gameState.buildMenuOpen = !gameState.buildMenuOpen;
    playSoundAt(updateContext, SoundType.ButtonClick, playerEntity.position);
  }
};

/**
 * Handles keyboard events for when a player action key is released.
 * @param key The key that was released (lowercase).
 * @param playerEntity The player entity (will be mutated).
 * @param gameState The current game state (will be mutated).
 * @param keysPressed A ref to the set of currently pressed keys.
 */
export const handlePlayerActionKeyUp = (
  key: string,
  playerEntity: HumanEntity,
  gameState: GameWorldState,
  keysPressed: React.MutableRefObject<Set<string>>,
) => {
  if (key === 'arrowup' || key === 'w') {
    playerEntity.direction.y = 0;
  } else if (key === 'arrowdown' || key === 's') {
    playerEntity.direction.y = 0;
  } else if (key === 'arrowleft' || key === 'a') {
    playerEntity.direction.x = 0;
  } else if (key === 'arrowright' || key === 'd') {
    playerEntity.direction.x = 0;
  }

  // Stop moving if no movement keys are pressed
  if (
    !keysPressed.current.has('arrowup') &&
    !keysPressed.current.has('arrowdown') &&
    !keysPressed.current.has('arrowleft') &&
    !keysPressed.current.has('arrowright') &&
    !keysPressed.current.has('w') &&
    !keysPressed.current.has('a') &&
    !keysPressed.current.has('s') &&
    !keysPressed.current.has('d')
  ) {
    if (playerEntity.activeAction === 'moving') {
      playerEntity.activeAction = 'idle';
    }
    // Player is no longer manually moving
    gameState.autopilotControls.isManuallyMoving = false;
  }

  // Stop other actions
  if (!keysPressed.current.has('e') && playerEntity.activeAction === 'gathering') {
    playerEntity.activeAction = 'idle';
  }
  if (!keysPressed.current.has('f') && playerEntity.activeAction === 'eating') {
    playerEntity.activeAction = 'idle';
  }
  if (!keysPressed.current.has('r') && playerEntity.activeAction === 'procreating') {
    playerEntity.activeAction = 'idle';
  }
  if (!keysPressed.current.has('h') && playerEntity.activeAction === 'feeding') {
    playerEntity.activeAction = 'idle';
  }
};
