import { GameWorldState } from '../world-types';
import { setMasterVolume } from '../sound/sound-loader';
import { updateWorld } from '../world-update';
import {
  FAST_FORWARD_AMOUNT_SECONDS
} from '../tribe-consts.ts';
import { findPlayerEntity } from '../utils/world-utils';
import { HumanEntity } from '../entities/characters/human/human-types';

/**
 * Handles global keyboard shortcuts that are not direct player actions.
 * NOTE: Functions that need to call `event.preventDefault()` (like for 'tab' or 'space')
 * should be checked for in the calling component, as this utility does not have access to the event object.
 *
 * @param key The key that was pressed (lowercase).
 * @param gameState The current game state.
 * @param isDebugOnRef A ref to the debug flag.
 * @param isEcosystemDebugOnRef A ref to the ecosystem debug flag.
 * @returns An object containing the potentially new game state and a boolean indicating if the key was handled.
 */
export const handleGameControlKeyDown = (
  key: string,
  gameState: GameWorldState,
  isDebugOnRef: React.MutableRefObject<boolean>,
  isEcosystemDebugOnRef?: React.MutableRefObject<boolean>,
): { newState: GameWorldState; handled: boolean } => {
  let handled = true;
  let newState = gameState;

  switch (key) {
    case 'm':
      gameState.isMuted = !gameState.isMuted;
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case '=':
    case '+':
      const newVolumeUp = Math.min(1, gameState.masterVolume + 0.1);
      gameState.masterVolume = parseFloat(newVolumeUp.toFixed(1));
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case '-':
      const newVolumeDown = Math.max(0, gameState.masterVolume - 0.1);
      gameState.masterVolume = parseFloat(newVolumeDown.toFixed(1));
      setMasterVolume(gameState.masterVolume, gameState.isMuted);
      break;
    case 't':
      newState = updateWorld(gameState, FAST_FORWARD_AMOUNT_SECONDS);
      break;
    case ' ':
    case 'p':
      gameState.isPaused = !gameState.isPaused;
      break;
    case '§':
    case '`':
      isDebugOnRef.current = !isDebugOnRef.current;
      if (!isDebugOnRef.current) {
        newState.debugCharacterId = undefined;
      } else {
        newState.debugCharacterId =
          findPlayerEntity(newState)?.id ??
          Array.from(newState.entities.entities.values()).find(
            (e) => e.type === 'human' || e.type === 'prey' || e.type === 'predator',
          )?.id;
      }
      break;
    case '1':
      if (isEcosystemDebugOnRef) {
        isEcosystemDebugOnRef.current = !isEcosystemDebugOnRef.current;
      }
      break;
    case 'tab':
      isDebugOnRef.current = true; // Always turn on debug if cycling

      const allCharacters = Array.from(newState.entities.entities.values()).filter(
        (e) => e.type === 'human' || e.type === 'prey' || e.type === 'predator',
      );

      if (allCharacters.length > 0) {
        // Sort: player first, then humans, then prey, then predators, all by ID
        const sortedCharacters = allCharacters.sort((a, b) => {
          if (a.type === 'human' && (a as HumanEntity).isPlayer) return -1;
          if (b.type === 'human' && (b as HumanEntity).isPlayer) return 1;
          if (a.type !== b.type) {
            const order: Record<string, number> = { human: 0, prey: 1, predator: 2 };
            const aOrder = order[a.type] ?? 999;
            const bOrder = order[b.type] ?? 999;
            return aOrder - bOrder;
          }
          return a.id - b.id;
        });

        const currentDebugId = newState.debugCharacterId;
        const currentIndex = currentDebugId ? sortedCharacters.findIndex((c) => c.id === currentDebugId) : -1;
        const nextIndex = (currentIndex + 1) % sortedCharacters.length;
        newState.debugCharacterId = sortedCharacters[nextIndex].id;
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
