import { useCallback, useEffect, useState, RefObject } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  MovePlayerEvent,
  SetPlayerDirectionEvent,
  MouseMoveEvent,
  MouseButtonEvent,
  TouchStartEvent,
  TouchMoveEvent,
  TouchEndEvent,
  TouchPoint,
  InputPosition,
  TouchRole,
} from './input-events';
import { RenderState, ViewportState } from '../game-render/render-state';
import { GameWorldState } from '../game-world/game-world-types';

const INPUT_KEYS = {
  LEFT: new Set(['ArrowLeft', 'a', 'A']),
  RIGHT: new Set(['ArrowRight', 'd', 'D']),
  UP: new Set(['ArrowUp', 'w', 'W']),
  DOWN: new Set(['ArrowDown', 's', 'S']),
} as const;

type InputState = {
  moveInput: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  };
  activeTouches: Map<number, TouchPoint>;
};

const initialInputState: InputState = {
  moveInput: {
    left: false,
    right: false,
    up: false,
    down: false,
  },
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

function convertTouchToPoint(
  touch: Touch,
  viewport: ViewportState,
  role: TouchRole = TouchRole.UNASSIGNED,
): TouchPoint {
  return {
    identifier: touch.identifier,
    position: calculateInputPosition(touch.clientX, touch.clientY, viewport),
    role,
    startTime: Date.now(),
  };
}

function assignTouchRoles(touches: TouchPoint[]): TouchPoint[] {
  return touches.map((touch, index) => ({
    ...touch,
    role: index === 0 ? TouchRole.MOVEMENT : index === 1 ? TouchRole.ACTION : TouchRole.UNASSIGNED,
  }));
}

type InputControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

export function InputController({ gameStateRef }: InputControllerProps) {
  const [inputState, setInputState] = useState<InputState>(initialInputState);

  const dispatchMovement = useCallback((moveInput: InputState['moveInput']) => {
    dispatchCustomEvent<MovePlayerEvent>(GameEvents.MOVE_PLAYER, { input: moveInput });

    if (moveInput.left && !moveInput.right) {
      dispatchCustomEvent<SetPlayerDirectionEvent>(GameEvents.SET_PLAYER_DIRECTION, { direction: 'left' });
    } else if (moveInput.right && !moveInput.left) {
      dispatchCustomEvent<SetPlayerDirectionEvent>(GameEvents.SET_PLAYER_DIRECTION, { direction: 'right' });
    }
  }, []);

  const handleKeyboardInput = useCallback(
    (event: KeyboardEvent, isKeyDown: boolean) => {
      // Handle movement input
      const newMoveInput = { ...inputState.moveInput };
      let inputChanged = false;

      for (const [direction, keys] of Object.entries(INPUT_KEYS)) {
        if (keys.has(event.key)) {
          const dir = direction.toLowerCase() as keyof typeof newMoveInput;
          if (newMoveInput[dir] !== isKeyDown) {
            newMoveInput[dir] = isKeyDown;
            inputChanged = true;
          }
        }
      }

      if (inputChanged) {
        setInputState((prev) => ({
          ...prev,
          moveInput: newMoveInput,
        }));
        dispatchMovement(newMoveInput);
      }
    },
    [inputState.moveInput, dispatchMovement],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!gameStateRef.current) return;

      const position = calculateInputPosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);
      dispatchCustomEvent<MouseMoveEvent>(GameEvents.MOUSE_MOVE, {
        position,
        timestamp: Date.now(),
      });
    },
    [gameStateRef],
  );

  const handleMouseButtons = useCallback(
    (event: MouseEvent, isDown: boolean) => {
      event.preventDefault();

      const button = event.button === 0 ? 'left' : event.button === 2 ? 'right' : null;
      if (button === null || !gameStateRef.current) return;

      const position = calculateInputPosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);
      dispatchCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, {
        button,
        isPressed: isDown,
        position,
        timestamp: Date.now(),
      });
    },
    [gameStateRef],
  );

  // Touch event handlers
  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      const viewport = gameStateRef.current.renderState.viewport;

      // Assign roles to all active touches
      const allTouches = Array.from(event.touches).map((touch) => {
        const existingTouch = Array.from(inputState.activeTouches.values()).find(
          (t) => t.identifier === touch.identifier,
        );
        return existingTouch || convertTouchToPoint(touch, viewport);
      });
      const touchesWithRoles = assignTouchRoles(allTouches);

      // Find primary and action touches
      const primaryTouch = touchesWithRoles.find((t) => t.role === TouchRole.MOVEMENT);
      const actionTouch = touchesWithRoles.find((t) => t.role === TouchRole.ACTION);

      // Update active touches
      setInputState((prev) => {
        const updatedTouches = new Map(prev.activeTouches);
        touchesWithRoles.forEach((touch) => updatedTouches.set(touch.identifier, touch));
        return {
          ...prev,
          activeTouches: updatedTouches,
        };
      });

      if (primaryTouch) {
        dispatchCustomEvent<TouchStartEvent>(GameEvents.TOUCH_START, {
          touches: touchesWithRoles,
          primaryTouch,
          actionTouch,
          timestamp: Date.now(),
        });
      }
    },
    [gameStateRef, inputState.activeTouches],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      const viewport = gameStateRef.current.renderState.viewport;
      const allTouches = Array.from(event.touches).map((touch) => {
        const existingTouch = Array.from(inputState.activeTouches.values()).find(
          (t) => t.identifier === touch.identifier,
        );
        if (existingTouch) {
          return {
            ...existingTouch,
            position: calculateInputPosition(touch.clientX, touch.clientY, viewport),
          };
        }
        return convertTouchToPoint(touch, viewport);
      });

      const touchesWithRoles = assignTouchRoles(allTouches);
      const primaryTouch = touchesWithRoles.find((t) => t.role === TouchRole.MOVEMENT);
      const actionTouch = touchesWithRoles.find((t) => t.role === TouchRole.ACTION);

      // Update active touches
      setInputState((prev) => {
        const updatedTouches = new Map(prev.activeTouches);
        touchesWithRoles.forEach((touch) => updatedTouches.set(touch.identifier, touch));
        return { ...prev, activeTouches: updatedTouches };
      });

      if (primaryTouch) {
        dispatchCustomEvent<TouchMoveEvent>(GameEvents.TOUCH_MOVE, {
          touches: touchesWithRoles,
          primaryTouch,
          actionTouch,
          timestamp: Date.now(),
        });
      }
    },
    [gameStateRef, inputState.activeTouches],
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      event.preventDefault();
      if (!gameStateRef.current) return;

      const viewport = gameStateRef.current.renderState.viewport;
      const endedTouches = Array.from(event.changedTouches).map((touch) => {
        const existingTouch = Array.from(inputState.activeTouches.values()).find(
          (t) => t.identifier === touch.identifier,
        );
        return {
          ...(existingTouch || convertTouchToPoint(touch, viewport)),
          position: calculateInputPosition(touch.clientX, touch.clientY, viewport),
        };
      });

      const remainingTouches = Array.from(event.touches).map((touch) => {
        const existingTouch = Array.from(inputState.activeTouches.values()).find(
          (t) => t.identifier === touch.identifier,
        );
        return {
          ...(existingTouch || convertTouchToPoint(touch, viewport)),
          position: calculateInputPosition(touch.clientX, touch.clientY, viewport),
        };
      });

      // Update active touches
      setInputState((prev) => {
        const updatedTouches = new Map(prev.activeTouches);
        endedTouches.forEach((touch) => updatedTouches.delete(touch.identifier));
        return {
          ...prev,
          activeTouches: updatedTouches,
        };
      });

      // Dispatch touch end event
      dispatchCustomEvent<TouchEndEvent>(GameEvents.TOUCH_END, {
        touches: remainingTouches,
        changedTouches: endedTouches,
        timestamp: Date.now(),
      });

      // Reset movement if no touches remain
      if (remainingTouches.length === 0) {
        dispatchMovement({
          left: false,
          right: false,
          up: false,
          down: false,
        });
      }
    },
    [gameStateRef, inputState.activeTouches, dispatchMovement],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleKeyboardInput(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKeyboardInput(event, false);
    const handleMouseDown = (event: MouseEvent) => handleMouseButtons(event, true);
    const handleMouseUp = (event: MouseEvent) => handleMouseButtons(event, false);
    const handleContextMenu = (event: Event) => event.preventDefault();

    // Mouse event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
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
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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
  }, [handleKeyboardInput, handleMouseButtons, handleMouseMove, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return null;
}