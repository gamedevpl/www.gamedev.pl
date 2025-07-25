import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import { findClosestEntity, findValidPlantingSpot, performTribeSplit } from '../utils/world-utils';
import {
  HUMAN_INTERACTION_RANGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_ATTACK_RANGE,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
  PLAYER_CALL_TO_FOLLOW_DURATION_HOURS,
  BERRY_BUSH_SPREAD_RADIUS,
} from '../world-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { calculateWrappedDistance } from '../utils/math-utils';
import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { PlayerActionHint, PlayerActionType } from '../ui/ui-types';

/**
 * Handles keyboard events that correspond to direct player actions.
 * @param key The key that was pressed (lowercase).
 * @param gameState The current game state (may be mutated).
 * @param playerEntity The player entity (will be mutated).
 * @param playerActionHints A ref to the list of available player actions.
 */
export const handlePlayerActionKeyDown = (
  key: string,
  gameState: GameWorldState,
  playerEntity: HumanEntity,
  playerActionHints: PlayerActionHint[],
): void => {
  const updateContext = { gameState, deltaTime: 0 };

  if (key === 'e') {
    const gatherBushTarget = findClosestEntity<BerryBushEntity>(
      playerEntity,
      gameState,
      'berryBush',
      HUMAN_INTERACTION_RANGE,
      (b) => b.food.length > 0 && playerEntity.food.length < playerEntity.maxFood,
    );

    const gatherCorpseTarget = findClosestEntity<HumanCorpseEntity>(
      playerEntity,
      gameState,
      'humanCorpse',
      HUMAN_INTERACTION_RANGE,
      (c) => c.food.length > 0 && playerEntity.food.length < playerEntity.maxFood,
    );

    let target: BerryBushEntity | HumanCorpseEntity | null = null;
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
    const potentialPartner = findClosestEntity<HumanEntity>(
      playerEntity,
      gameState,
      'human',
      HUMAN_INTERACTION_RANGE,
      (h) => {
        const human = h as HumanEntity;
        return (
          (human.id !== playerEntity.id &&
            human.gender !== playerEntity.gender &&
            human.isAdult &&
            playerEntity.isAdult &&
            human.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
            playerEntity.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
            (human.procreationCooldown || 0) <= 0 &&
            (playerEntity.procreationCooldown || 0) <= 0 &&
            (human.gender === 'female' ? !human.isPregnant : !playerEntity.isPregnant)) ||
          false
        );
      },
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
    const humanTarget = findClosestEntity<HumanEntity>(
      playerEntity,
      gameState,
      'human',
      HUMAN_ATTACK_RANGE,
      (h) => (h as HumanEntity).id !== playerEntity.id && (h as HumanEntity).leaderId !== playerEntity.leaderId,
    );

    if (humanTarget) {
      playerEntity.activeAction = 'attacking';
      playerEntity.attackTargetId = humanTarget.id;
    }
  } else if (key === 'b') {
    const plantAction = playerActionHints.find((a) => a.type === PlayerActionType.Plant);
    if (plantAction) {
      const plantingSpot = findValidPlantingSpot(playerEntity.position, gameState, 50, BERRY_BUSH_SPREAD_RADIUS);
      if (plantingSpot) {
        playerEntity.activeAction = 'planting';
        playerEntity.target = plantingSpot;
        gameState.hasPlayerPlantedBush = true;
      }
    }
  } else if (key === 'v') {
    playerEntity.isCallingToAttack = true;
    playerEntity.callToAttackEndTime = gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
    addVisualEffect(
      gameState,
      VisualEffectType.CallToAttack,
      playerEntity.position,
      PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
    );
    playSoundAt(updateContext, SoundType.CallToAttack, playerEntity.position);
  } else if (key === 'c') {
    playerEntity.isCallingToFollow = true;
    playerEntity.callToFollowEndTime = gameState.time + PLAYER_CALL_TO_FOLLOW_DURATION_HOURS;
    addVisualEffect(
      gameState,
      VisualEffectType.CallToFollow,
      playerEntity.position,
      PLAYER_CALL_TO_FOLLOW_DURATION_HOURS,
    );
    playSoundAt(updateContext, SoundType.CallToFollow, playerEntity.position);
  } else if (key === 'k') {
    performTribeSplit(playerEntity, gameState);
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
};
