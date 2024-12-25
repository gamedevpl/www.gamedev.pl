import { useCallback, useEffect, useState, RefObject } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchPoint,
  InputPosition,
  LionTargetEvent,
} from './input-events';
import { RenderState, ViewportState } from '../game-render/render-state';
import { GameWorldState } from '../game-world/game-world-types';

type InputState = {
  isPressed: boolean;
  activeTouches: Map<number, TouchPoint>;
};

const initialInputState: InputState = {
  isPressed: false,
  activeTouches: new Map(),
};

function calculateWorldCoordinates(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): { worldX: number; worldY: number } {
  const worldX = screenX - viewport.x;
  const worldY = screenY - viewport.y;
  return { worldX, worldY };
}

function calculateInputPosition(clientX: number, clientY: number, viewport: ViewportState): InputPosition {
  const { innerWidth, innerHeight } = window;
  const centerX = innerWidth / 2;
  const centerY = innerHeight / 2;

  // Calculate normalized coordinates (-1 to 1)
  const normalizedX = (clientX - centerX) / centerX;
  const normalizedY = (clientY - centerY) / centerY;

  // Calculate world coordinates
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

function dispatchLionTarget(position: InputPosition | null, isPressed: boolean) {
  dispatchCustomEvent<LionTargetEvent>(GameEvents.SET_LION_TARGET, {
    position: position
      ? {
          x: position.worldX,
          y: position.worldY,
        }
      : null,
    isPressed,
  });
}

type InputControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
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

      // Update lion target if mouse is pressed - continuous movement
      if (inputState.isPressed) {
        dispatchLionTarget(position, true);
      }
    },
    [gameStateRef, inputState.isPressed],
  );

  const handleMouseButtons = useCallback(
    (event: MouseEvent, isDown: boolean) => {
      event.preventDefault();

      if (event.button !== 0 || !gameStateRef.current) return; // Only handle left mouse button

      const position = calculateInputPosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);

      setInputState((prev) => ({ ...prev, isPressed: isDown }));

      dispatchCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, {
        button: 'left',
        isPressed: isDown,
        position,
        timestamp: Date.now(),
      });

      // For mouse down, it's a single step if it's the initial press
      if (isDown) {
        dispatchLionTarget(position, true);
      } else {
        dispatchLionTarget(null, false);
      }
    },
    [gameStateRef],
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      const viewport = gameStateRef.current.renderState.viewport;
      const touch = event.touches[0]; // Use first touch
      if (!touch) return;

      const position = calculateInputPosition(touch.clientX, touch.clientY, viewport);

      setInputState((prev) => ({ ...prev, isPressed: true }));
      // Initial touch is always a single step
      dispatchLionTarget(position, true);
    },
    [gameStateRef],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current || !inputState.isPressed) return;

      const viewport = gameStateRef.current.renderState.viewport;
      const touch = event.touches[0]; // Use first touch
      if (!touch) return;

      const position = calculateInputPosition(touch.clientX, touch.clientY, viewport);
      // Touch move is continuous movement
      dispatchLionTarget(position, true);
    },
    [gameStateRef, inputState.isPressed],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      setInputState((prev) => ({ ...prev, isPressed: false }));

      dispatchLionTarget(null, false);
    },
    [gameStateRef],
  );

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => handleMouseButtons(event, true);
    const handleMouseUp = (event: MouseEvent) => handleMouseButtons(event, false);
    const handleContextMenu = (event: Event) => event.preventDefault();

    // Mouse event listeners
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);

    // Touch event listeners
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      // Remove mouse event listeners
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);

      // Remove touch event listeners
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleMouseButtons, handleMouseMove, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return null;
}
