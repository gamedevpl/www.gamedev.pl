import { GameWorldState } from "../world-types";
import { setMasterVolume } from "../sound/sound-loader";
import { updateWorld } from "../world-update";
import { FAST_FORWARD_AMOUNT_SECONDS } from "../world-consts";
import { findAllHumans, findPlayerEntity } from "../utils/world-utils";
import { HumanEntity } from "../entities/characters/human/human-types";

/**
 * Handles global keyboard shortcuts that are not direct player actions.
 * NOTE: Functions that need to call `event.preventDefault()` (like for 'tab' or 'space')
 * should be checked for in the calling component, as this utility does not have access to the event object.
 *
 * @param key The key that was pressed (lowercase).
 * @param gameState The current game state.
 * @param isDebugOnRef A ref to the debug flag.
 * @returns An object containing the potentially new game state and a boolean indicating if the key was handled.
 */
export const handleGameControlKeyDown = (
  key: string,
  gameState: GameWorldState,
  isDebugOnRef: React.MutableRefObject<boolean>,
): { newState: GameWorldState; handled: boolean } => {
  let handled = true;
  let newState = gameState;

  switch (key) {
    case "m":
      gameState.isMuted = !gameState.isMuted;
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case "=":
    case "+":
      const newVolumeUp = Math.min(1, gameState.masterVolume + 0.1);
      gameState.masterVolume = parseFloat(newVolumeUp.toFixed(1));
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case "-":
      const newVolumeDown = Math.max(0, gameState.masterVolume - 0.1);
      gameState.masterVolume = parseFloat(newVolumeDown.toFixed(1));
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case "t":
      newState = updateWorld(gameState, FAST_FORWARD_AMOUNT_SECONDS);
      break;
    case " ":
    case "p":
      gameState.isPaused = !gameState.isPaused;
      break;
    case "§":
    case "`":
      isDebugOnRef.current = !isDebugOnRef.current;
      if (!isDebugOnRef.current) {
        newState.debugCharacterId = undefined;
      } else {
        newState.debugCharacterId =
          findPlayerEntity(newState)?.id ?? findAllHumans(newState)?.[0]?.id;
      }
      break;
    case "tab":
      isDebugOnRef.current = true; // Always turn on debug if cycling

      const humans = Array.from(newState.entities.entities.values()).filter(
        (e) => e.type === "human",
      ) as HumanEntity[];

      if (humans.length > 0) {
        const sortedHumans = humans.sort((a, b) => (a.isPlayer ? -1 : a.id - b.id));
        const currentDebugId = newState.debugCharacterId;
        const currentIndex = currentDebugId ? sortedHumans.findIndex((h) => h.id === currentDebugId) : -1;
        const nextIndex = (currentIndex + 1) % sortedHumans.length;
        newState.debugCharacterId = sortedHumans[nextIndex].id;
      } else {
        newState.debugCharacterId = undefined;
      }
      break;
    default:
      handled = false;
      break;
  }

  return { newState, handled };
};
