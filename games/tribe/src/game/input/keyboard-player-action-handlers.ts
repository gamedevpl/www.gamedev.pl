import { HumanEntity } from '../entities/characters/human/human-types';
import { GameWorldState } from '../world-types';
import {
  findClosestEntity,
  findValidPlantingSpot,
  performTribeSplit,
  isHostile,
  canProcreate,
} from '../utils';
import {
  HUMAN_INTERACTION_RANGE,
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
    if (shiftKey) {
      gameState.autopilotControls.behaviors.procreation = !gameState.autopilotControls.behaviors.procreation;
      return;
    }
    const potentialPartner = findClosestEntity<HumanEntity>(
      playerEntity,
      gameState,
      'human',
      HUMAN_INTERACTION_RANGE,
      (h) => canProcreate(playerEntity, h as HumanEntity),
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
    const humanTarget = findClosestEntity<HumanEntity>(
      playerEntity,
      gameState,
      'human',
      HUMAN_ATTACK_RANGE,
      (h) => isHostile(playerEntity, h as HumanEntity),
    );

    if (humanTarget) {
      playerEntity.activeAction = 'attacking';
      playerEntity.attackTargetId = humanTarget.id;
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
  if (!keysPressed.current.has('h') && playerEntity.activeAction === 'feeding') {
    playerEntity.activeAction = 'idle';
  }
};
