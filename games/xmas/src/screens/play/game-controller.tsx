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
  isMoveSantaEvent,
  isSetSantaDirectionEvent,
  isStartChargingEvent,
  isStopChargingEvent,
} from './game-input/input-events';

interface GameControllerProps {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
}

/**
 * GameController component that handles game events and updates game state
 * This component doesn't render anything visible, it only handles game logic
 */
export function GameController({ gameStateRef }: GameControllerProps) {
  // Handle Santa movement events
  useCustomEvent<MoveSantaEvent>(GameEvents.MOVE_SANTA, (event) => {
    if (!gameStateRef.current || !isMoveSantaEvent(event)) return;

    moveSanta(gameStateRef.current.gameWorldState.playerSanta, event.input);
  });

  // Handle Santa direction events
  useCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, (event) => {
    if (!gameStateRef.current || !isSetSantaDirectionEvent(event)) return;

    setSantaDirection(gameStateRef.current.gameWorldState.playerSanta, event.direction);
  });

  // Handle charging start event
  useCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, (event) => {
    if (!gameStateRef.current || !isStartChargingEvent(event)) return;

    const { playerSanta } = gameStateRef.current.gameWorldState;
    
    // Update Santa's charging state
    moveSanta(playerSanta, {
      charging: true,
      chargeStartTime: event.timestamp
    });
  });

  // Handle charging stop event
  useCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, (event) => {
    if (!gameStateRef.current || !isStopChargingEvent(event)) return;

    const { playerSanta } = gameStateRef.current.gameWorldState;
    const { chargeStartTime } = playerSanta.input;

    // Reset charging state first
    moveSanta(playerSanta, {
      charging: false,
      chargeStartTime: null
    });

    // Validate charging duration and create fireball
    if (chargeStartTime !== null) {
      const chargeDuration = event.timestamp - chargeStartTime;
      addFireballFromSanta(gameStateRef.current.gameWorldState, playerSanta, chargeDuration);
    }
  });

  // Component doesn't render anything visible
  return null;
}