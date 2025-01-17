import { useCallback, useEffect, useState, RefObject } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  TouchEndEvent,
  InputPosition,
  TouchPoint,
  TouchRole,
} from './input-events';
import { RenderState, ViewportState } from '../game-render/render-state';
import { GameWorldState } from '../game-world/game-world-types';

type InputControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

type InputState = {
  isPressed: boolean;
  activeTouches: Map<number, TouchPoint>;
};

const initialInputState: InputState = {
  isPressed: false,
  activeTouches: new Map(),
};

export function InputController({ gameStateRef }: InputControllerProps) {
  const [inputState, setInputState] = useState<InputState>(initialInputState);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!gameStateRef.current) return;

      const position = calculateInputPosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);
      dispatchCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, {
        position,
        timestamp: Date.now(),
      });

      if (inputState.isPressed) {
        dispatchCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, {
          button: 'left',
          isPressed: true,
          position,
          timestamp: Date.now(),
        });
      }
    },
    [gameStateRef, inputState.isPressed],
  );

  const handleMouseButtons = useCallback(
    (event: MouseEvent, isDown: boolean) => {
      event.preventDefault();

      if (event.button !== 0 || !gameStateRef.current) return;

      const position = calculateInputPosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);

      setInputState((prev) => ({ ...prev, isPressed: isDown }));

      dispatchCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, {
        button: 'left',
        isPressed: isDown,
        position,
        timestamp: Date.now(),
      });
    },
    [gameStateRef],
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      const viewport = gameStateRef.current.renderState.viewport;
      const touch = event.touches[0];
      if (!touch) return;

      const position = calculateInputPosition(touch.clientX, touch.clientY, viewport);

      setInputState((prev) => ({ ...prev, isPressed: true }));
      dispatchCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, {
        touches: [],
        primaryTouch: {
          identifier: touch.identifier,
          position,
          role: TouchRole.MOVEMENT,
          startTime: Date.now(),
        },
        timestamp: Date.now(),
      });
    },
    [gameStateRef],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current || !inputState.isPressed) return;

      const viewport = gameStateRef.current.renderState.viewport;
      const touch = event.touches[0];
      if (!touch) return;

      const position = calculateInputPosition(touch.clientX, touch.clientY, viewport);
      dispatchCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, {
        touches: [],
        primaryTouch: {
          identifier: touch.identifier,
          position,
          role: TouchRole.MOVEMENT,
          startTime: Date.now(),
        },
        timestamp: Date.now(),
      });
    },
    [gameStateRef, inputState.isPressed],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      setInputState((prev) => ({ ...prev, isPressed: false }));
      dispatchCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, {
        touches: [],
        changedTouches: [],
        timestamp: Date.now(),
      });
    },
    [gameStateRef],
  );

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => handleMouseButtons(event, true);
    const handleMouseUp = (event: MouseEvent) => handleMouseButtons(event, false);
    const handleContextMenu = (event: Event) => event.preventDefault();

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);

      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleMouseButtons, handleMouseMove, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return null;
}

function calculateInputPosition(clientX: number, clientY: number, viewport: ViewportState): InputPosition {
  const { innerWidth, innerHeight } = window;
  const centerX = innerWidth / 2;
  const centerY = innerHeight / 2;

  const normalizedX = (clientX - centerX) / centerX;
  const normalizedY = (clientY - centerY) / centerY;

  const { worldX, worldY } = calculateWorldCoordinates(clientX, clientY, viewport);

  return {
    normalizedX,
    normalizedY,
    screenX: clientX,
    screenY: clientY,
    worldX,
    worldY,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  };
}

function calculateWorldCoordinates(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): { worldX: number; worldY: number } {
  const worldX = screenX - viewport.x;
  const worldY = screenY - viewport.y;
  return { worldX, worldY };
}
