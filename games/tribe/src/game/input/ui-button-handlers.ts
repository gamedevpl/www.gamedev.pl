import { ClickableUIButton, UIButtonActionType } from '../ui/ui-types';
import { GameWorldState } from '../world-types';
import { setMasterVolume } from '../sound/sound-loader';
import { updateWorld } from '../world-update';
import { FAST_FORWARD_AMOUNT_SECONDS } from '../world-consts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { findPlayerEntity } from '../utils/world-utils';

/**
 * Handles the logic for a UI button click event.
 * It may mutate the received gameState object or return a new one (e.g., for fast-forward).
 * @param button The UI button that was clicked.
 * @param gameState The current state of the game world.
 * @returns The (potentially new) state of the game world.
 */
export const handleUIButtonClick = (button: ClickableUIButton, gameState: GameWorldState): GameWorldState => {
  const updateContext = { gameState, deltaTime: 0 };
  const player = findPlayerEntity(gameState);
  if (player) {
    playSoundAt(updateContext, SoundType.ButtonClick, player.position);
  }

  switch (button.action) {
    case UIButtonActionType.ToggleMute:
      gameState.isMuted = !gameState.isMuted;
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case UIButtonActionType.TogglePause:
      gameState.isPaused = !gameState.isPaused;
      break;
    case UIButtonActionType.FastForward:
      // updateWorld returns a new state object
      return updateWorld(gameState, FAST_FORWARD_AMOUNT_SECONDS);
    case UIButtonActionType.ToggleProcreationBehavior:
      gameState.autopilotControls.behaviors.procreation = !gameState.autopilotControls.behaviors.procreation;
      break;
    case UIButtonActionType.TogglePlantingBehavior:
      gameState.autopilotControls.behaviors.planting = !gameState.autopilotControls.behaviors.planting;
      break;
    case UIButtonActionType.ToggleGatheringBehavior:
      gameState.autopilotControls.behaviors.gathering = !gameState.autopilotControls.behaviors.gathering;
      break;
    case UIButtonActionType.ToggleAttackBehavior:
      gameState.autopilotControls.behaviors.attack = !gameState.autopilotControls.behaviors.attack;
      break;
    case UIButtonActionType.ToggleCallToAttackBehavior:
      gameState.autopilotControls.behaviors.callToAttack = !gameState.autopilotControls.behaviors.callToAttack;
      break;
    case UIButtonActionType.ToggleFollowMeBehavior:
      gameState.autopilotControls.behaviors.followMe = !gameState.autopilotControls.behaviors.followMe;
      break;
    case UIButtonActionType.ToggleFeedChildrenBehavior:
      gameState.autopilotControls.behaviors.feedChildren = !gameState.autopilotControls.behaviors.feedChildren;
      break;
  }

  // For most cases, the original gameState object is mutated, so we return it.
  return gameState;
};
