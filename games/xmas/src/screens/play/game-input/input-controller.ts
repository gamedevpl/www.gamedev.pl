import { useCallback, useEffect, useState, RefObject } from 'react';
import { dispatchCustomEvent } from '../../../utils/custom-events';
import {
  GameEvents,
  MoveSantaEvent,
  SetSantaDirectionEvent,
  StartChargingEvent,
  StopChargingEvent,
  MouseMoveEvent,
  MouseButtonEvent,
  MousePosition,
} from './input-events';
import { RenderState, ViewportState } from '../game-render/render-state';
import { GameWorldState } from '../game-world/game-world-types';

const INPUT_KEYS = {
  LEFT: new Set(['ArrowLeft', 'a', 'A']),
  RIGHT: new Set(['ArrowRight', 'd', 'D']),
  UP: new Set(['ArrowUp', 'w', 'W']),
  DOWN: new Set(['ArrowDown', 's', 'S']),
  CHARGE: new Set(['Space', ' ']),
} as const;

type InputState = {
  moveInput: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
  };
  isCharging: boolean;
  chargeStartTime: number | null;
};

const initialInputState: InputState = {
  moveInput: {
    left: false,
    right: false,
    up: false,
    down: false,
  },
  isCharging: false,
  chargeStartTime: null,
};

function calculateWorldCoordinates(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): { worldX: number; worldY: number } {
  // Convert screen coordinates to world coordinates by reversing viewport translation
  const worldX = screenX - viewport.x;
  const worldY = screenY - viewport.y;

  return { worldX, worldY };
}

function calculateMousePosition(clientX: number, clientY: number, viewport: ViewportState): MousePosition {
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

type InputControllerProps = {
  gameStateRef: RefObject<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>;
};

export function InputController({ gameStateRef }: InputControllerProps) {
  const [inputState, setInputState] = useState<InputState>(initialInputState);

  const dispatchMovement = useCallback((moveInput: InputState['moveInput']) => {
    dispatchCustomEvent<MoveSantaEvent>(GameEvents.MOVE_SANTA, { input: moveInput });

    if (moveInput.left && !moveInput.right) {
      dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, { direction: 'left' });
    } else if (moveInput.right && !moveInput.left) {
      dispatchCustomEvent<SetSantaDirectionEvent>(GameEvents.SET_SANTA_DIRECTION, { direction: 'right' });
    }
  }, []);

  const handleKeyboardInput = useCallback(
    (event: KeyboardEvent, isKeyDown: boolean) => {
      // Handle charging/throwing input
      if (INPUT_KEYS.CHARGE.has(event.key)) {
        if (isKeyDown && !inputState.isCharging) {
          const timestamp = Date.now();

          setInputState((prev) => ({
            ...prev,
            isCharging: true,
            chargeStartTime: timestamp,
          }));
          dispatchCustomEvent<StartChargingEvent>(GameEvents.START_CHARGING, { timestamp });
        } else if (!isKeyDown) {
          const timestamp = Date.now();

          if (inputState.isCharging) {
            setInputState((prev) => ({
              ...prev,
              isCharging: false,
              chargeStartTime: null,
            }));
            dispatchCustomEvent<StopChargingEvent>(GameEvents.STOP_CHARGING, { timestamp });
          }
        }
        return;
      }

      // Handle movement input
      const newMoveInput = { ...inputState.moveInput };
      let inputChanged = false;

      for (const [direction, keys] of Object.entries(INPUT_KEYS)) {
        if (direction === 'CHARGE') continue;
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
    [inputState.moveInput, inputState.isCharging, dispatchMovement],
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!gameStateRef.current) return;

      const position = calculateMousePosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);
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

      const position = calculateMousePosition(event.clientX, event.clientY, gameStateRef.current.renderState.viewport);
      dispatchCustomEvent<MouseButtonEvent>(GameEvents.MOUSE_BUTTON, {
        button,
        isPressed: isDown,
        position,
        timestamp: Date.now(),
      });
    },
    [gameStateRef],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => handleKeyboardInput(event, true);
    const handleKeyUp = (event: KeyboardEvent) => handleKeyboardInput(event, false);
    const handleMouseDown = (event: MouseEvent) => handleMouseButtons(event, true);
    const handleMouseUp = (event: MouseEvent) => handleMouseButtons(event, false);
    const handleContextMenu = (event: Event) => event.preventDefault();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleKeyboardInput, handleMouseButtons, handleMouseMove]);

  return null;
}
