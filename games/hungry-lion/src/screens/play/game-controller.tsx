import { RefObject, useRef } from 'react';
import { useCustomEvent } from '../../utils/custom-events';
import { GameWorldState } from './game-world/game-world-types';
import { RenderState } from './game-render/render-state';
import {
  GameEvents,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  TouchEndEvent,
  InputPosition,
  LionTargetEvent,
} from './game-input/input-events';

type GameControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

type TouchState = {
  isActive: boolean;
  position: InputPosition | null;
};

export function GameController({ gameStateRef }: GameControllerProps) {
  const touchStateRef = useRef<TouchState>({
    isActive: false,
    position: null,
  });

  // Handle SET_LION_TARGET event
  useCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, (event) => {
    if (!gameStateRef.current) return;

    // Update lion's target position in game state, including the singleStep flag
    gameStateRef.current.gameWorldState.lion.targetPosition =
      event.isPressed && event.position
        ? {
            x: event.position.x,
            y: event.position.y,
          }
        : null;
  });

  // Handle touch events with multi-touch support
  useCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, () => {
    if (!gameStateRef.current) return;
  });

  useCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, () => {
    if (!gameStateRef.current || !touchStateRef.current.isActive) return;
  });

  useCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, () => {
    if (!gameStateRef.current) return;
  });

  // Handle mouse movement
  useCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, () => {
    if (!gameStateRef.current || touchStateRef.current.isActive) return;
  });

  // Handle mouse buttons
  useCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, () => {
    if (!gameStateRef.current || touchStateRef.current.isActive) return;
  });

  return null;
}
