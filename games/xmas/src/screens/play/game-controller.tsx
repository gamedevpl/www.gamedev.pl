import { RefObject } from 'react';
import { useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import { addFireballFromSanta, moveSanta, setSantaDirection } from './game-world/game-world-manipulate';
import {
  GameEvents,
  MoveSantaEvent,
  SetSantaDirectionEvent,
  StartChargingEvent,
  StopChargingEvent,
} from './game-input/input-events';

type GameControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

export function GameController({ gameStateRef }: GameControllerProps) {
  useCustomEvent<MoveSantaEvent>(GameEvents.MOVE_SANTA, (event) => {
    if (!gameStateRef.current) return;
    moveSanta(gameStateRef.current.gameWorldState.playerSanta, event.input);
  });

  useCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, (event) => {
    if (!gameStateRef.current) return;
    setSantaDirection(gameStateRef.current.gameWorldState.playerSanta, event.direction);
  });

  // Fireball charging handlers
  useCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;

    moveSanta(playerSanta, {
      charging: true,
      chargeStartTime: event.timestamp,
    });
  });

  useCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;
    const { chargeStartTime } = playerSanta.input;

    // Only process fireball charging if not carrying a gift
    if (chargeStartTime !== null) {
      moveSanta(playerSanta, {
        charging: false,
        chargeStartTime: null,
      });

      addFireballFromSanta(gameStateRef.current.gameWorldState, playerSanta, event.timestamp - chargeStartTime);
    }
  });

  return null;
}
