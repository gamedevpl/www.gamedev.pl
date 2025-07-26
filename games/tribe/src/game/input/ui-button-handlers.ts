import { ClickableUIButton, UIButtonActionType } from '../ui/ui-types';
import { GameWorldState } from '../world-types';
import { setMasterVolume } from '../sound/sound-loader';
import { updateWorld } from '../world-update';
import {
  FAST_FORWARD_AMOUNT_SECONDS,
  PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
  PLAYER_CALL_TO_FOLLOW_DURATION_HOURS,
} from '../world-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { findPlayerEntity, performTribeSplit } from '../utils/world-utils';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';

/**
 * Handles the logic for a UI button click event.
 * It may mutate the received gameState object or return a new one (e.g., for fast-forward).
 * @param button The UI button that was clicked.
 * @param shift Whether the Shift key was held during the click.
 * @param gameState The current state of the game world.
 * @returns The (potentially new) state of the game world.
 */
export const handleUIButtonClick = (
  button: ClickableUIButton,
  shift: boolean,
  gameState: GameWorldState,
): GameWorldState => {
  const updateContext = { gameState, deltaTime: 0 };
  const player = findPlayerEntity(gameState);
  if (player) {
    playSoundAt(updateContext, SoundType.ButtonClick, player.position);
  }

  // Set activation time for visual feedback
  const clickedButtonInState = gameState.uiButtons.find((b) => b.id === button.id);
  if (clickedButtonInState) {
    clickedButtonInState.lastActivated = Date.now();
  }

  if (shift) {
    gameState.hasPlayerEnabledAutopilot = true;
  }

  const { behaviors } = gameState.autopilotControls;

  switch (button.action) {
    // --- System Controls ---
    case UIButtonActionType.ToggleMute:
      gameState.isMuted = !gameState.isMuted;
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case UIButtonActionType.TogglePause:
      gameState.isPaused = !gameState.isPaused;
      break;
    case UIButtonActionType.FastForward:
      return updateWorld(gameState, FAST_FORWARD_AMOUNT_SECONDS);

    // --- Player Commands & Autopilot Toggles ---
    case UIButtonActionType.CommandEat:
      if (player && player.food.length > 0) {
        player.activeAction = 'eating';
      }
      break;
    case UIButtonActionType.CommandGather:
      if (shift) {
        behaviors.gathering = !behaviors.gathering;
      } else if (player) {
        player.activeAction = 'gathering';
      }
      break;
    case UIButtonActionType.CommandPlant:
      if (shift) {
        behaviors.planting = !behaviors.planting;
      } else if (player) {
        gameState.autopilotControls.isManuallyPlanting = true;
      }
      break;
    case UIButtonActionType.ToggleProcreationBehavior:
      behaviors.procreation = !behaviors.procreation;
      break;
    case UIButtonActionType.ToggleAttackBehavior:
      behaviors.attack = !behaviors.attack;
      break;
    case UIButtonActionType.ToggleFeedChildBehavior:
      behaviors.feedChildren = !behaviors.feedChildren;
      break;
    case UIButtonActionType.ToggleAutopilotFollowLeaderBehavior:
      behaviors.followLeader = !behaviors.followLeader;
      break;
    case UIButtonActionType.CommandCallToAttack:
      if (player && player.leaderId === player.id) {
        player.isCallingToAttack = true;
        player.callToAttackEndTime = gameState.time + PLAYER_CALL_TO_ATTACK_DURATION_HOURS;
        addVisualEffect(
          gameState,
          VisualEffectType.CallToAttack,
          player.position,
          PLAYER_CALL_TO_ATTACK_DURATION_HOURS,
        );
        playSoundAt(updateContext, SoundType.CallToAttack, player.position);
      }
      break;
    case UIButtonActionType.CommandFollowMe:
      if (shift) {
        behaviors.followLeader = !behaviors.followLeader;
      } else if (player && player.leaderId === player.id) {
        player.isCallingToFollow = true;
        player.callToFollowEndTime = gameState.time + PLAYER_CALL_TO_FOLLOW_DURATION_HOURS;
        addVisualEffect(
          gameState,
          VisualEffectType.CallToFollow,
          player.position,
          PLAYER_CALL_TO_FOLLOW_DURATION_HOURS,
        );
        playSoundAt(updateContext, SoundType.CallToFollow, player.position);
      }
      break;
    case UIButtonActionType.CommandTribeSplit:
      if (player) {
        performTribeSplit(player, gameState);
      }
      break;
  }

  // For most cases, the original gameState object is mutated, so we return it.
  return gameState;
};
