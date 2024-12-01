import { RefObject, useEffect } from 'react';
import { useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import { addFireballFromSanta, moveSanta, setSantaDirection, throwGift } from './game-world/game-world-manipulate';
import {
  GameEvents,
  MoveSantaEvent,
  SetSantaDirectionEvent,
  StartChargingEvent,
  StopChargingEvent,
  StartThrowingGiftEvent,
  StopThrowingGiftEvent,
} from './game-input/input-events';

type GameControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

export function GameController({ gameStateRef }: GameControllerProps) {
  // Notify input controller about Santa's gift state
  useEffect(() => {
    const interval = setInterval(() => {
      if (!gameStateRef.current) return;
      const { playerSanta } = gameStateRef.current.gameWorldState;
      window.dispatchEvent(
        new CustomEvent('santa:stateChange', {
          detail: { hasGift: !!playerSanta.carriedGift }
        })
      );
    }, 100);

    return () => clearInterval(interval);
  }, [gameStateRef]);

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
    
    // Only start charging if not carrying a gift
    if (!playerSanta.carriedGift) {
      moveSanta(playerSanta, {
        charging: true,
        chargeStartTime: event.timestamp,
      });
    }
  });

  useCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;
    const { chargeStartTime } = playerSanta.input;

    // Only process fireball charging if not carrying a gift
    if (!playerSanta.carriedGift && chargeStartTime !== null) {
      moveSanta(playerSanta, {
        charging: false,
        chargeStartTime: null,
      });

      addFireballFromSanta(
        gameStateRef.current.gameWorldState, 
        playerSanta, 
        event.timestamp - chargeStartTime
      );
    }
  });

  // Gift throwing handlers
  useCustomEvent<StartThrowingGiftEvent>(GameEvents.START_THROWING_GIFT, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;
    
    // Only start gift throwing if carrying a gift
    if (playerSanta.carriedGift) {
      moveSanta(playerSanta, {
        charging: true,
        chargeStartTime: event.timestamp,
      });
    }
  });

  useCustomEvent<StopThrowingGiftEvent>(GameEvents.STOP_THROWING_GIFT, (event) => {
    if (!gameStateRef.current) return;
    const { playerSanta } = gameStateRef.current.gameWorldState;
    const { chargeStartTime } = playerSanta.input;

    // Only process gift throwing if carrying a gift and charging was started
    if (playerSanta.carriedGift && chargeStartTime !== null) {
      const chargeTime = event.timestamp - chargeStartTime;
      
      // Reset input state first
      moveSanta(playerSanta, {
        charging: false,
        chargeStartTime: null,
      });

      // Throw the gift
      throwGift(
        gameStateRef.current.gameWorldState,
        playerSanta,
        chargeTime
      );
    }
  });

  return null;
}