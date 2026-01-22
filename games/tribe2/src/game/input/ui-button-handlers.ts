import { ClickableUIButton, UIButtonActionType } from '../ui/ui-types';
import { DiplomacyStatus, GameWorldState } from '../world-types';
import { setMasterVolume } from '../sound/sound-loader';
import { updateWorld } from '../world-update';
import { FAST_FORWARD_AMOUNT_SECONDS } from '../entities/tribe/tribe-consts.ts';
import { playSoundAt } from '../sound/sound-manager';
import { SoundType } from '../sound/sound-types';
import { findPlayerEntity } from '../utils/world-utils';
import { dismissNotification } from '../notifications/notification-utils';
import { centerViewportOn } from '../utils/camera-utils';
import { HumanEntity } from '../entities/characters/human/human-types';

/**
 * Handles the logic for a UI button click event.
 * It may mutate the received gameState object or return a new one (e.g., for fast-forward).
 * @param button The UI button that was clicked.
 * @param shift Whether the Shift key was held during the click.
 * @param gameState The current state of the game world.
 * @param returnToIntro A function to return to the intro screen.
 * @returns The (potentially new) state of the game world.
 */
export const handleUIButtonClick = (
  button: ClickableUIButton,
  shift: boolean,
  gameState: GameWorldState,
  returnToIntro: () => void,
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

  if (
    shift &&
    [
      UIButtonActionType.CommandGather,
      UIButtonActionType.CommandPlant,
      UIButtonActionType.ToggleProcreationBehavior,
      UIButtonActionType.CommandBuild,
    ].includes(button.action)
  ) {
    gameState.hasPlayerEnabledAutopilot++;
  }

  switch (button.action) {
    // --- System Controls ---
    case UIButtonActionType.ReturnToIntro:
      gameState.exitConfirmation = 'pending';
      gameState.isPaused = true;
      break;
    case UIButtonActionType.ConfirmExitYes:
      returnToIntro();
      gameState.exitConfirmation = 'inactive';
      break;
    case UIButtonActionType.ConfirmExitNo:
      gameState.exitConfirmation = 'inactive';
      gameState.isPaused = false;
      break;
    case UIButtonActionType.ToggleMute:
      gameState.isMuted = !gameState.isMuted;
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case UIButtonActionType.TogglePause:
      gameState.isPaused = !gameState.isPaused;
      break;
    case UIButtonActionType.FastForward:
      return updateWorld(gameState, FAST_FORWARD_AMOUNT_SECONDS);
    case UIButtonActionType.DismissTutorial:
      gameState.tutorialState.isActive = false;
      break;

    // --- Player Commands & Autopilot Toggles ---
    case UIButtonActionType.CommandEat:
      if (player && player.food.length > 0) {
        player.activeAction = 'eating';
      }
      break;
    case UIButtonActionType.ToggleDiplomacy:
      if (player && player.leaderId && button.targetTribeId) {
        const playerTribeId = player.leaderId;
        const otherTribeId = button.targetTribeId;
        const otherTribe = gameState.entities.entities[otherTribeId] as HumanEntity | undefined;

        const playerDiplomacy = player.tribeControl?.diplomacy;
        const otherDiplomacy = otherTribe?.tribeControl?.diplomacy;

        if (playerDiplomacy && otherDiplomacy) {
          const currentStatus = playerDiplomacy[otherTribeId] || DiplomacyStatus.Friendly;
          const newStatus =
            currentStatus === DiplomacyStatus.Friendly ? DiplomacyStatus.Hostile : DiplomacyStatus.Friendly;

          playerDiplomacy[otherTribeId] = newStatus;
          otherDiplomacy[playerTribeId] = newStatus;
        }
      }
      break;
    case UIButtonActionType.OpenTribeModal:
      gameState.tribeModalOpen = true;
      break;
    case UIButtonActionType.RecenterCamera:
      gameState.cameraFollowingPlayer = true;
      break;
    case UIButtonActionType.CloseTribeModal:
      gameState.tribeModalOpen = false;
      break;
    case UIButtonActionType.ToggleStrategicMenu:
      gameState.strategicMenuOpen = !gameState.strategicMenuOpen;
      break;
    case UIButtonActionType.SelectStrategicObjective:
      if (player && player.leaderId && button.objective !== undefined) {
        const leader = gameState.entities.entities[player.leaderId] as HumanEntity | undefined;
        if (leader) {
          // Initialize tribeControl if it doesn't exist
          if (!leader.tribeControl) {
            leader.tribeControl = {
              diplomacy: {},
            };
          }
          // Update the strategic objective
          leader.tribeControl.strategicObjective = button.objective;
          gameState.strategicMenuOpen = false;
        }
      }
      break;
  }

  // For most cases, the original gameState object is mutated, so we return it.
  return gameState;
};

/**
 * Handles a click event within the notification area.
 * @param gameState The current game state.
 * @param mouseX The x-coordinate of the mouse click.
 * @param mouseY The y-coordinate of the mouse click.
 * @returns True if a notification button was clicked and the event was handled.
 */
export function handleNotificationClick(gameState: GameWorldState, mouseX: number, mouseY: number): boolean {
  if (!gameState.notificationButtonRects) {
    return false;
  }

  const player = findPlayerEntity(gameState);

  // Check dismiss buttons
  for (const [notificationId, rect] of Object.entries(gameState.notificationButtonRects.dismiss)) {
    if (mouseX >= rect.x && mouseX <= rect.x + rect.width && mouseY >= rect.y && mouseY <= rect.y + rect.height) {
      dismissNotification(gameState, notificationId);
      if (player) {
        playSoundAt({ gameState, deltaTime: 0 }, SoundType.ButtonClick, player.position);
      }
      return true;
    }
  }

  // Check view buttons
  for (const [notificationId, rect] of Object.entries(gameState.notificationButtonRects.view)) {
    if (mouseX >= rect.x && mouseX <= rect.x + rect.width && mouseY >= rect.y && mouseY <= rect.y + rect.height) {
      const notification = gameState.notifications.find((n) => n.id === notificationId);
      if (notification) {
        let targetPos = notification.targetPosition;
        if (!targetPos && notification.targetEntityIds && notification.targetEntityIds.length > 0) {
          const targetEntity = gameState.entities.entities[notification.targetEntityIds[0]];
          if (targetEntity) {
            targetPos = targetEntity.position;
          }
        }

        if (targetPos) {
          centerViewportOn(gameState, targetPos);
        }
        if (player) {
          playSoundAt({ gameState, deltaTime: 0 }, SoundType.ButtonClick, player.position);
        }
        if (notification.highlightedEntityIds) {
          notification.renderHighlights = !notification.renderHighlights;
        }
        return true; // Click handled
      }
    }
  }

  return false;
}
